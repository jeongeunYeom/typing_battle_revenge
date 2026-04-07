const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

const WORDS = [
  { answer: "call off", clue: "취소하다" },
  { answer: "give up", clue: "포기하다" },
  { answer: "put off", clue: "미루다" },
  { answer: "look after", clue: "돌보다" },
  { answer: "turn down", clue: "거절하다 / 소리를 줄이다" },
  { answer: "find out", clue: "알아내다" },
  { answer: "run into", clue: "우연히 마주치다" },
  { answer: "get over", clue: "극복하다" },
  { answer: "take off", clue: "벗다 / 이륙하다" },
  { answer: "work out", clue: "해결하다 / 운동하다" }
];

const rooms = {};
/*
rooms[roomCode] = {
  players: [{ id, name, score, ready }],
  currentWord: { answer, clue },
  round: 1,
  maxRounds: 10,
  solvedBy: null
}
*/

function randomWord() {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function sanitizeInput(text) {
  return (text || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function getOpponent(room, socketId) {
  return room.players.find((p) => p.id !== socketId);
}

function getPlayer(room, socketId) {
  return room.players.find((p) => p.id === socketId);
}

function emitRoomState(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  io.to(roomCode).emit("roomState", {
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score
    })),
    round: room.round,
    maxRounds: room.maxRounds
  });
}

function startRound(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  room.currentWord = randomWord();
  room.solvedBy = null;

  io.to(roomCode).emit("newRound", {
    clue: room.currentWord.clue,
    round: room.round,
    maxRounds: room.maxRounds
  });

  emitRoomState(roomCode);
}

function endGame(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  let result = "무승부";

  if (sorted.length === 2) {
    if (sorted[0].score > sorted[1].score) {
      result = `${sorted[0].name} 승리!`;
    } else if (sorted[0].score < sorted[1].score) {
      result = `${sorted[1].name} 승리!`;
    }
  }

  io.to(roomCode).emit("gameOver", {
    result,
    players: room.players.map((p) => ({
      name: p.name,
      score: p.score
    }))
  });
}

function nextRoundOrEnd(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  room.round += 1;

  if (room.round > room.maxRounds) {
    endGame(roomCode);
    return;
  }

  setTimeout(() => {
    startRound(roomCode);
  }, 1500);
}

function createAttackEffect() {
  const effects = ["shake", "flip", "blur"];
  return effects[Math.floor(Math.random() * effects.length)];
}

io.on("connection", (socket) => {
  console.log("connected:", socket.id);

  socket.on("createRoom", ({ roomCode, name }) => {
    if (!roomCode || !name) {
      socket.emit("errorMessage", "방 코드와 이름을 입력하세요.");
      return;
    }

    if (rooms[roomCode]) {
      socket.emit("errorMessage", "이미 존재하는 방입니다.");
      return;
    }

    rooms[roomCode] = {
      players: [{ id: socket.id, name, score: 0, ready: true }],
      currentWord: null,
      round: 1,
      maxRounds: 10,
      solvedBy: null
    };

    socket.join(roomCode);
    socket.data.roomCode = roomCode;

    socket.emit("joinedRoom", { roomCode, isHost: true });
    emitRoomState(roomCode);
  });

  socket.on("joinRoom", ({ roomCode, name }) => {
    const room = rooms[roomCode];

    if (!room) {
      socket.emit("errorMessage", "존재하지 않는 방입니다.");
      return;
    }

    if (room.players.length >= 2) {
      socket.emit("errorMessage", "방이 가득 찼습니다.");
      return;
    }

    room.players.push({ id: socket.id, name, score: 0, ready: true });
    socket.join(roomCode);
    socket.data.roomCode = roomCode;

    socket.emit("joinedRoom", { roomCode, isHost: false });
    io.to(roomCode).emit("systemMessage", "2명이 모두 입장했습니다. 게임을 시작합니다.");

    emitRoomState(roomCode);
    startRound(roomCode);
  });

  socket.on("submitAnswer", ({ answer, elapsedMs }) => {
    const roomCode = socket.data.roomCode;
    const room = rooms[roomCode];

    if (!room || !room.currentWord) return;
    if (room.solvedBy) return;

    const normalized = sanitizeInput(answer);
    const correct = sanitizeInput(room.currentWord.answer);

    if (normalized === correct) {
      room.solvedBy = socket.id;

      const player = getPlayer(room, socket.id);
      const opponent = getOpponent(room, socket.id);

      if (!player) return;

      let gained = 10;

      if (elapsedMs <= 2500) gained += 5;
      if (elapsedMs <= 1500) gained += 5;

      player.score += gained;

      io.to(socket.id).emit("answerResult", {
        correct: true,
        message: `정답! +${gained}점`
      });

      if (opponent) {
        const effect = createAttackEffect();

        io.to(opponent.id).emit("attackReceived", {
          effect,
          from: player.name,
          answer: room.currentWord.answer
        });
      }

      io.to(roomCode).emit("roundSolved", {
        solverId: socket.id,
        solverName: player.name,
        answer: room.currentWord.answer
      });

      emitRoomState(roomCode);
      nextRoundOrEnd(roomCode);
    } else {
      io.to(socket.id).emit("answerResult", {
        correct: false,
        message: "오답!"
      });
    }
  });

  socket.on("disconnect", () => {
    const roomCode = socket.data.roomCode;
    if (!roomCode || !rooms[roomCode]) return;

    const room = rooms[roomCode];
    room.players = room.players.filter((p) => p.id !== socket.id);

    if (room.players.length === 0) {
      delete rooms[roomCode];
    } else {
      io.to(roomCode).emit("systemMessage", "상대가 나갔습니다.");
      emitRoomState(roomCode);
    }

    console.log("disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
