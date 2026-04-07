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

const MAX_HP = 100;

const rooms = {};

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

function getDamageByTime(elapsedMs) {
  if (elapsedMs <= 1500) return 22;
  if (elapsedMs <= 2500) return 18;
  return 12;
}

function createAttackEffect() {
  const effects = ["shake", "flip", "blur"];
  return effects[Math.floor(Math.random() * effects.length)];
}

function getSkillName(combo) {
  if (combo >= 5) return "MEGA REVENGE";
  if (combo >= 3) return "PHRASAL BURST";
  return "WORD HIT";
}

function emitRoomState(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  io.to(roomCode).emit("roomState", {
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      hp: p.hp,
      combo: p.combo
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

function endGame(roomCode, forcedWinnerName = null) {
  const room = rooms[roomCode];
  if (!room) return;

  let result = "무승부";

  if (forcedWinnerName) {
    result = `${forcedWinnerName} 승리!`;
  } else {
    const sorted = [...room.players].sort((a, b) => {
      if (b.hp !== a.hp) return b.hp - a.hp;
      return b.score - a.score;
    });

    if (sorted.length === 2) {
      if (sorted[0].hp > sorted[1].hp) result = `${sorted[0].name} 승리!`;
      else if (sorted[0].hp < sorted[1].hp) result = `${sorted[1].name} 승리!`;
      else if (sorted[0].score > sorted[1].score) result = `${sorted[0].name} 승리!`;
      else if (sorted[0].score < sorted[1].score) result = `${sorted[1].name} 승리!`;
    }
  }

  io.to(roomCode).emit("gameOver", {
    result,
    players: room.players.map((p) => ({
      name: p.name,
      score: p.score,
      hp: p.hp,
      combo: p.combo
    }))
  });
}

function nextRoundOrEnd(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  const deadPlayer = room.players.find((p) => p.hp <= 0);
  if (deadPlayer) {
    const winner = room.players.find((p) => p.id !== deadPlayer.id);
    endGame(roomCode, winner ? winner.name : null);
    return;
  }

  room.round += 1;

  if (room.round > room.maxRounds) {
    endGame(roomCode);
    return;
  }

  setTimeout(() => {
    startRound(roomCode);
  }, 1500);
}

io.on("connection", (socket) => {
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
      players: [
        {
          id: socket.id,
          name,
          score: 0,
          hp: MAX_HP,
          combo: 0
        }
      ],
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

    room.players.push({
      id: socket.id,
      name,
      score: 0,
      hp: MAX_HP,
      combo: 0
    });

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

      if (!player || !opponent) return;

      const damage = getDamageByTime(elapsedMs);
      const bonus = player.combo >= 2 ? player.combo * 2 : 0;
      const totalDamage = damage + bonus;

      player.score += 10 + Math.floor(totalDamage / 2);
      player.combo += 1;
      opponent.combo = 0;
      opponent.hp = Math.max(0, opponent.hp - totalDamage);

      const effect = createAttackEffect();
      const skillName = getSkillName(player.combo);

      io.to(socket.id).emit("answerResult", {
        correct: true,
        message: `정답! ${skillName} 발동!`,
        damage: totalDamage,
        skillName
      });

      io.to(opponent.id).emit("attackReceived", {
        effect,
        from: player.name,
        answer: room.currentWord.answer,
        damage: totalDamage,
        skillName
      });

      io.to(roomCode).emit("roundSolved", {
        solverId: socket.id,
        solverName: player.name,
        answer: room.currentWord.answer,
        damage: totalDamage,
        skillName
      });

      emitRoomState(roomCode);
      nextRoundOrEnd(roomCode);
    } else {
      const player = getPlayer(room, socket.id);
      if (player) player.combo = 0;

      io.to(socket.id).emit("answerResult", {
        correct: false,
        message: "오답! 콤보가 끊겼어요."
      });

      emitRoomState(roomCode);
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
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
