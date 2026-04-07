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
const skillBanner = document.getElementById("skillBanner");

const inviteLinkInput = document.getElementById("inviteLinkInput");
const copyInviteBtn = document.getElementById("copyInviteBtn");
const kakaoShareBtn = document.getElementById("kakaoShareBtn");

const resultText = document.getElementById("resultText");
const finalScores = document.getElementById("finalScores");

let currentRoundStartTime = null;
let mySocketId = null;
let currentRoomCode = "";

socket.on("connect", () => {
  mySocketId = socket.id;
  autoJoinByQuery();
});

function autoJoinByQuery() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get("room");
  if (room) {
    roomInput.value = room.toUpperCase();
  }
}

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
  if (e.key === "Enter") submitAnswer();
});

copyInviteBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(inviteLinkInput.value);
    skillBanner.textContent = "초대 링크 복사 완료!";
  } catch {
    skillBanner.textContent = "복사 실패! 직접 복사해줘.";
  }
});

kakaoShareBtn.addEventListener("click", () => {
  shareToKakao();
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

    const safeHp = Math.max(0, Math.min(100, player.hp));
    const isMe = player.id === mySocketId;

    div.innerHTML = `
      <div class="playerHeader">
        <div class="playerName">${player.name}${isMe ? " 💘" : " ⚡"}</div>
        <div class="comboBadge">콤보 x${player.combo}</div>
      </div>
      <div class="hpLabel">HP ${safeHp}/100</div>
      <div class="hpBar">
        <div class="hpFill" style="width:${safeHp}%"></div>
      </div>
      <div class="scoreText">점수: ${player.score}점</div>
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

function buildInviteLink(roomCode) {
  return `${window.location.origin}/?room=${encodeURIComponent(roomCode)}`;
}

function initKakao() {
  if (!window.Kakao) return false;
  if (!window.Kakao.isInitialized()) {
    // 여기에 본인 JavaScript 키 넣기
    const KAKAO_JS_KEY = "여기에_자바스크립트_키";
    if (KAKAO_JS_KEY === "여기에_자바스크립트_키") return false;
    window.Kakao.init(KAKAO_JS_KEY);
  }
  return true;
}

function shareToKakao() {
  if (!initKakao()) {
    skillBanner.textContent = "카카오 키를 넣으면 공유 가능해!";
    return;
  }

  window.Kakao.Share.sendDefault({
    objectType: "feed",
    content: {
      title: "복수혈전 영단어 대결",
      description: "나랑 단어 배틀하자! 먼저 맞히고 공격하는 실시간 영어 게임",
      imageUrl: "https://dummyimage.com/600x400/ffe8f4/333333&text=Typing+Battle",
      link: {
        mobileWebUrl: inviteLinkInput.value,
        webUrl: inviteLinkInput.value
      }
    },
    buttons: [
      {
        title: "게임 참가하기",
        link: {
          mobileWebUrl: inviteLinkInput.value,
          webUrl: inviteLinkInput.value
        }
      }
    ]
  });
}

socket.on("joinedRoom", ({ roomCode }) => {
  currentRoomCode = roomCode;
  roomCodeText.textContent = roomCode;
  inviteLinkInput.value = buildInviteLink(roomCode);

  lobbyMessage.textContent = "";
  lobbyPanel.classList.add("hidden");
  gamePanel.classList.remove("hidden");

  skillBanner.textContent = "READY!";
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
  skillBanner.textContent = "GO!";
  currentRoundStartTime = Date.now();
  answerInput.focus();
});

socket.on("answerResult", ({ correct, message, damage, skillName }) => {
  feedbackText.textContent = message;
  if (correct) {
    answerInput.disabled = true;
    submitBtn.disabled = true;
    skillBanner.textContent = `${skillName} - ${damage} DAMAGE!`;
  } else {
    skillBanner.textContent = "COMBO BREAK!";
  }
});

socket.on("attackReceived", ({ effect, from, answer, damage, skillName }) => {
  systemText.textContent = `${from}의 공격! 정답: ${answer}`;
  skillBanner.textContent = `${skillName} 맞음! -${damage} HP`;
  applyAttackEffect(effect);
});

socket.on("roundSolved", ({ solverName, answer, damage, skillName }) => {
  systemText.textContent = `${solverName} 정답! 정답은 "${answer}"`;
  skillBanner.textContent = `${skillName} / ${damage} DAMAGE`;
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
    div.textContent = `${player.name} | HP ${player.hp} | ${player.score}점 | 콤보 ${player.combo}`;
    finalScores.appendChild(div);
  });
});
