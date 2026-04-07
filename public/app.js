const socket = io();

const lobbyPanel = document.getElementById("lobbyPanel");
const gamePanel = document.getElementById("gamePanel");
const resultPanel = document.getElementById("resultPanel");

const nameInput = document.getElementById("nameInput");
const roomInput = document.getElementById("roomInput");
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const lobbyMessage = document.getElementById("lobbyMessage");

const roomCodeText = document.getElementById("roomCodeText");
const roundText = document.getElementById("roundText");
const scoreBoard = document.getElementById("scoreBoard");
const clueText = document.getElementById("clueText");
const answerInput = document.getElementById("answerInput");
const submitBtn = document.getElementById("submitBtn");
const feedbackText = document.getElementById("feedbackText");
const systemText = document.getElementById("systemText");
const gameRoot = document.getElementById("gameRoot");

const resultText = document.getElementById("resultText");
const finalScores = document.getElementById("finalScores");

let currentRoundStartTime = null;
let mySocketId = null;

socket.on("connect", () => {
  mySocketId = socket.id;
});

createBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();
  const roomCode = roomInput.value.trim().toUpperCase();

  if (!name || !roomCode) {
    lobbyMessage.textContent = "닉네임과 방 코드를 입력하세요.";
    return;
  }

  socket.emit("createRoom", { name, roomCode });
});

joinBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();
  const roomCode = roomInput.value.trim().toUpperCase();

  if (!name || !roomCode) {
    lobbyMessage.textContent = "닉네임과 방 코드를 입력하세요.";
    return;
  }

  socket.emit("joinRoom", { name, roomCode });
});

submitBtn.addEventListener("click", submitAnswer);

answerInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    submitAnswer();
  }
});

function submitAnswer() {
  const answer = answerInput.value.trim();
  if (!answer || !currentRoundStartTime) return;

  const elapsedMs = Date.now() - currentRoundStartTime;

  socket.emit("submitAnswer", {
    answer,
    elapsedMs
  });
}

function renderScoreBoard(players) {
  scoreBoard.innerHTML = "";

  players.forEach((player) => {
    const div = document.createElement("div");
    div.className = "playerCard";
  div.innerHTML = `
    <div><strong>${player.name}</strong> ${player.id === mySocketId ? " 💘" : " ⚡"}</div>
    <div>점수: ${player.score}점</div>
  `;
    scoreBoard.appendChild(div);
  });
}

function applyAttackEffect(effect) {
  if (effect === "shake") {
    gameRoot.classList.add("shake");
    setTimeout(() => gameRoot.classList.remove("shake"), 1600);
  }

  if (effect === "flip") {
    gameRoot.classList.add("flip-text");
    setTimeout(() => gameRoot.classList.remove("flip-text"), 3000);
  }

  if (effect === "blur") {
    gameRoot.classList.add("blur-input");
    setTimeout(() => gameRoot.classList.remove("blur-input"), 3000);
  }
}

socket.on("joinedRoom", ({ roomCode }) => {
  lobbyMessage.textContent = "";
  roomCodeText.textContent = roomCode;
  lobbyPanel.classList.add("hidden");
  gamePanel.classList.remove("hidden");
  systemText.textContent = "상대를 기다리는 중...";
});

socket.on("errorMessage", (msg) => {
  lobbyMessage.textContent = msg;
});

socket.on("systemMessage", (msg) => {
  systemText.textContent = msg;
});

socket.on("roomState", ({ players, round, maxRounds }) => {
  renderScoreBoard(players);
  roundText.textContent = `${round} / ${maxRounds}`;
});

socket.on("newRound", ({ clue, round, maxRounds }) => {
  clueText.textContent = clue;
  roundText.textContent = `${round} / ${maxRounds}`;
  answerInput.value = "";
  answerInput.disabled = false;
  submitBtn.disabled = false;
  feedbackText.textContent = "";
  systemText.textContent = "정답을 가장 먼저 입력하세요.";
  currentRoundStartTime = Date.now();
  answerInput.focus();
});

socket.on("answerResult", ({ correct, message }) => {
  feedbackText.textContent = message;
  if (correct) {
    answerInput.disabled = true;
    submitBtn.disabled = true;
  }
});

socket.on("attackReceived", ({ effect, from, answer }) => {
  systemText.textContent = `${from}의 공격! (${answer})`;
  applyAttackEffect(effect);
});

socket.on("roundSolved", ({ solverName, answer }) => {
  systemText.textContent = `${solverName} 정답! 정답은 "${answer}"`;
  answerInput.disabled = true;
  submitBtn.disabled = true;
  currentRoundStartTime = null;
});

socket.on("gameOver", ({ result, players }) => {
  gamePanel.classList.add("hidden");
  resultPanel.classList.remove("hidden");

  resultText.textContent = result;
  finalScores.innerHTML = "";

  players.forEach((player) => {
    const div = document.createElement("div");
    div.className = "finalScoreItem";
    div.textContent = `${player.name}: ${player.score}점`;
    finalScores.appendChild(div);
  });
});
