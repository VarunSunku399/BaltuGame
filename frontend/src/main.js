// ─── Main.js ──────────────────────────────────────────────────────────────────
// UI Controller: Upload → Game → Question Screen → Game Over
//
// New gameplay loop:
//   • Game runs freely, player dodges obstacles
//   • Every 10 seconds a question fires: game PAUSES → full-screen question
//   • Correct → game resumes, 10s timer resets
//   • Wrong / timeout → GAME OVER (sudden death)
// ─────────────────────────────────────────────────────────────────────────────

import { GameEngine } from './GameEngine.js';
import { GameState  } from './GameState.js';

// ── DOM ───────────────────────────────────────────────────────────────────────
const screenUpload   = document.getElementById('screen-upload');
const screenGame     = document.getElementById('screen-game');
const screenQuestion = document.getElementById('screen-question');
const screenGameover = document.getElementById('screen-gameover');

const dropZone        = document.getElementById('drop-zone');
const pdfInput        = document.getElementById('pdf-input');
const fileNameDisplay = document.getElementById('file-name-display');
const btnStart        = document.getElementById('btn-start');
const uploadStatus    = document.getElementById('upload-status');

const gameCanvas    = document.getElementById('game-canvas');
const hudScore      = document.getElementById('hud-score');
const hudStatus     = document.getElementById('hud-status');
const hudCountdown  = document.getElementById('hud-countdown');
const btnBack       = document.getElementById('btn-back');

const qText         = document.getElementById('q-text');
const qChoices      = document.getElementById('q-choices');
const qTimerFill    = document.getElementById('q-timer-fill');
const qSeconds      = document.getElementById('q-seconds');

const goScore        = document.getElementById('go-score');
const goCorrect      = document.getElementById('go-correct');
const goWrong        = document.getElementById('go-wrong');
const gameoverReason = document.getElementById('gameover-reason');
const btnRetry       = document.getElementById('btn-retry');
const btnNewPdf      = document.getElementById('btn-new-pdf');

// Leaderboard / name entry
const playerNameInput = document.getElementById('player-name-input');
const btnSaveScore    = document.getElementById('btn-save-score');
const saveStatus      = document.getElementById('save-status');
const lbRows          = document.getElementById('lb-rows');

// ── Config ────────────────────────────────────────────────────────────────────
const QUESTION_INTERVAL = 10; // seconds between questions
const QUESTION_TIME     = 15; // seconds to answer

// ── State ─────────────────────────────────────────────────────────────────────
let engine        = null;
let ws            = null;
let selectedFile  = null;
let currentPdfName = 'Unknown PDF';
let gameComplete  = false; // set true when server says all questions delivered

let questionCountdownTimer = null; // setInterval for the 10s between-question HUD
let questionRetryTimer     = null; // setTimeout for retrying when queue is empty
let questionTimeLeft       = QUESTION_INTERVAL;

let answerTimer   = null;
let answerFired   = false;

// ── Particle Background ───────────────────────────────────────────────────────
(function initBgCanvas() {
  const bg  = document.getElementById('bg-canvas');
  const ctx = bg.getContext('2d');
  const pts = Array.from({ length: 60 }, () => ({
    x: Math.random(), y: Math.random(),
    vx: (Math.random() - 0.5) * 0.00015,
    vy: (Math.random() - 0.5) * 0.00015,
    r: 1 + Math.random() * 2,
    a: 0.1 + Math.random() * 0.4
  }));
  let W = 0, H = 0;
  const resize = () => { bg.width = W = innerWidth; bg.height = H = innerHeight; };
  window.addEventListener('resize', resize); resize();
  const frame = () => {
    ctx.clearRect(0, 0, W, H);
    for (const p of pts) {
      p.x = (p.x + p.vx + 1) % 1;
      p.y = (p.y + p.vy + 1) % 1;
      ctx.save(); ctx.globalAlpha = p.a; ctx.fillStyle = '#7c5cfc';
      ctx.beginPath(); ctx.arc(p.x*W, p.y*H, p.r, 0, Math.PI*2); ctx.fill(); ctx.restore();
    }
    for (let i = 0; i < pts.length; i++) for (let j = i+1; j < pts.length; j++) {
      const dx = (pts[i].x-pts[j].x)*W, dy = (pts[i].y-pts[j].y)*H;
      const d = Math.sqrt(dx*dx+dy*dy);
      if (d < 120) {
        ctx.save(); ctx.globalAlpha = 0.04*(1-d/120); ctx.strokeStyle='#7c5cfc'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(pts[i].x*W,pts[i].y*H); ctx.lineTo(pts[j].x*W,pts[j].y*H); ctx.stroke(); ctx.restore();
      }
    }
    requestAnimationFrame(frame);
  };
  frame();
})();

// ── Screen Manager ────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── File Upload ───────────────────────────────────────────────────────────────
function setFile(file) {
  if (!file || file.type !== 'application/pdf') return;
  selectedFile = file;
  currentPdfName = file.name;
  fileNameDisplay.textContent = `📎 ${file.name}`;
  fileNameDisplay.classList.remove('hidden');
  btnStart.disabled = false;
}
pdfInput.addEventListener('change', () => setFile(pdfInput.files[0]));
dropZone.addEventListener('click', () => pdfInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); setFile(e.dataTransfer.files[0]); });

// ── WebSocket ─────────────────────────────────────────────────────────────────
function connectWebSocket() {
  ws = new WebSocket(`ws://${window.location.host}`);
  ws.onopen  = () => console.log('[WS] Connected');
  ws.onclose = () => console.log('[WS] Disconnected');
  ws.onerror = e  => console.error('[WS] Error', e);
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.type === 'STATUS')          showUploadStatus(msg.payload.message);
    if (msg.type === 'QUESTIONS_READY') onQuestionsReady();
    if (msg.type === 'QUESTION')        GameState.enqueueQuestion(msg.payload);
    if (msg.type === 'GAME_COMPLETE')   { gameComplete = true; console.log('[WS] All questions delivered.'); }
    if (msg.type === 'ERROR')           showUploadStatus(`❌ ${msg.payload.message}`, true);
  };
}

function onQuestionsReady() {
  uploadStatus.classList.add('hidden');
  startGame();
}

// ── Upload ────────────────────────────────────────────────────────────────────
btnStart.addEventListener('click', async () => {
  if (!selectedFile) return;
  btnStart.disabled = true;
  showUploadStatus('⏳ Uploading PDF…');
  if (!ws || ws.readyState > 1) connectWebSocket();
  try {
    const fd = new FormData();
    fd.append('pdf', selectedFile);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(await res.text());
    showUploadStatus('🧠 AI is reading your PDF…');
  } catch (err) {
    showUploadStatus(`❌ Upload failed: ${err.message}`, true);
    btnStart.disabled = false;
  }
});

function showUploadStatus(msg, isError = false) {
  uploadStatus.classList.remove('hidden');
  uploadStatus.textContent = msg;
  uploadStatus.style.cssText = isError
    ? 'color:#ff6b6b;border-color:rgba(255,107,107,0.2);background:rgba(255,107,107,0.07)'
    : '';
}

// ── Game Start ────────────────────────────────────────────────────────────────
function startGame() {
  GameState.resetRound();
  gameComplete     = false;
  questionRetries  = 0;
  showScreen('screen-game');

  if (!engine) {
    engine = new GameEngine(gameCanvas);
    engine.onDeath = () => triggerGameOver('💀 You were hit by an obstacle!');
  } else {
    engine.reset();
  }

  engine.start();
  GameState.status = 'running';

  startQuestionCountdown();
  window.addEventListener('keydown', onKeyDown);
  gameCanvas.addEventListener('click', onCanvasClick);

  hudStatus.textContent = 'DODGE!';
}

function onKeyDown(e) {
  if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); engine?.handleJump(); }
}
function onCanvasClick() { engine?.handleJump(); }

// ── Question Countdown (10s between questions) ────────────────────────────────
function startQuestionCountdown() {
  clearInterval(questionCountdownTimer);  // kill any running interval
  clearTimeout(questionRetryTimer);       // kill any pending retry — THIS is what prevents double-intervals
  questionRetries  = 0;
  questionTimeLeft = QUESTION_INTERVAL;
  hudCountdown.textContent = `${questionTimeLeft}s`;
  hudCountdown.classList.remove('urgent');

  questionCountdownTimer = setInterval(() => {
    if (GameState.status !== 'running') return;
    questionTimeLeft--;
    hudCountdown.textContent = `${questionTimeLeft}s`;
    hudCountdown.classList.toggle('urgent', questionTimeLeft <= 3);

    if (questionTimeLeft <= 0) {
      clearInterval(questionCountdownTimer);
      hudCountdown.classList.remove('urgent');
      triggerQuestion();
    }
  }, 1000);
}

// ── Score HUD tick ────────────────────────────────────────────────────────────
setInterval(() => {
  if (GameState.status === 'running') {
    hudScore.textContent = GameState.score;
  }
}, 100);

// ── Trigger Question ──────────────────────────────────────────────────────────
let questionRetries = 0;
const MAX_RETRIES   = 5;

function triggerQuestion() {
  const q = GameState.dequeueQuestion();

  if (!q) {
    // All questions delivered — stop asking forever
    if (gameComplete) {
      hudStatus.textContent  = '🎓 All questions done!';
      hudCountdown.textContent = '—';
      return;
    }

    questionRetries++;

    if (questionRetries >= MAX_RETRIES) {
      console.warn('[Q] No question after max retries, skipping cycle.');
      questionRetries = 0;
      hudStatus.textContent = 'DODGE!';
      startQuestionCountdown(); // this also clears questionRetryTimer
      return;
    }

    // Still waiting — retry in 2s (store the ID so it can be cancelled)
    hudStatus.textContent = `⏳ Loading question…`;
    questionRetryTimer = setTimeout(() => {
      if (GameState.status === 'running') triggerQuestion();
    }, 2000);
    return;
  }

  // Got a question — reset retries and pause game
  questionRetries = 0;
  GameState.status = 'paused';
  hudStatus.textContent = '⚡ QUESTION TIME!';

  // Populate question screen
  qText.textContent = q.question;
  qChoices.innerHTML = '';

  q.choices.forEach((choice, idx) => {
    const btn = document.createElement('button');
    btn.className   = 'q-choice-btn';
    btn.textContent = `${['A','B','C','D'][idx]}. ${choice}`;
    btn.id          = `choice-${idx}`;
    btn.addEventListener('click', () => onChoiceSelected(choice, q.answer, btn));
    qChoices.appendChild(btn);
  });

  showScreen('screen-question');
  startAnswerTimer(q);
}

// ── Answer Timer (15s to answer) ──────────────────────────────────────────────
function startAnswerTimer(q) {
  answerFired = false;
  let timeLeft = QUESTION_TIME;
  qSeconds.textContent = timeLeft;

  // Animate the fill bar shrinking
  qTimerFill.style.transition = 'none';
  qTimerFill.style.width = '100%';
  requestAnimationFrame(() => {
    qTimerFill.style.transition = `width ${QUESTION_TIME}s linear`;
    qTimerFill.style.width = '0%';
  });

  clearInterval(answerTimer);
  answerTimer = setInterval(() => {
    timeLeft--;
    qSeconds.textContent = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(answerTimer);
      if (!answerFired) onTimeout(q);
    }
  }, 1000);
}

function onChoiceSelected(choice, answer, btn) {
  if (answerFired) return;
  answerFired = true;
  clearInterval(answerTimer);
  qTimerFill.style.transition = 'none';

  disableChoices();

  // Highlight correct + chosen
  document.querySelectorAll('.q-choice-btn').forEach(b => {
    const label = b.textContent.slice(3); // strip "A. "
    if (label === answer) b.classList.add('correct');
  });

  const isCorrect = choice === answer;
  if (!isCorrect) btn.classList.add('incorrect');

  if (isCorrect) {
    GameState.answerCorrect();
    // Short celebration pause then resume
    setTimeout(() => resumeGameAfterQuestion(), 1400);
  } else {
    GameState.answerWrong();
    setTimeout(() => triggerGameOver('❌ Wrong answer — game over!'), 1400);
  }
}

function onTimeout(q) {
  if (answerFired) return;
  answerFired = true;
  disableChoices();

  // Show correct answer
  document.querySelectorAll('.q-choice-btn').forEach(b => {
    if (b.textContent.slice(3) === q.answer) b.classList.add('correct');
  });

  GameState.answerTimeout();
  setTimeout(() => triggerGameOver('⏱ Time ran out — game over!'), 1400);
}

function disableChoices() {
  document.querySelectorAll('.q-choice-btn').forEach(b => b.disabled = true);
}

// ── Resume After Correct Answer ───────────────────────────────────────────────
function resumeGameAfterQuestion() {
  GameState.status = 'running';
  showScreen('screen-game');
  hudStatus.textContent = 'DODGE!';
  startQuestionCountdown(); // reset the 10s interval
}

// ── Game Over ─────────────────────────────────────────────────────────────────
function triggerGameOver(reason) {
  clearInterval(questionCountdownTimer);
  clearInterval(answerTimer);
  engine?.stop();
  GameState.status = 'dead';
  window.removeEventListener('keydown', onKeyDown);
  gameCanvas.removeEventListener('click', onCanvasClick);

  goScore.textContent   = GameState.score;
  goCorrect.textContent = GameState.correctAnswers;
  goWrong.textContent   = GameState.wrongAnswers;
  gameoverReason.textContent = reason || '';

  // Reset name entry UI
  playerNameInput.value = '';
  playerNameInput.disabled = false;
  btnSaveScore.disabled = false;
  saveStatus.textContent = '';
  saveStatus.className = 'save-status';

  showScreen('screen-gameover');
  fetchLeaderboard();
}

// ── Save Score to DB ──────────────────────────────────────────────────────────
btnSaveScore.addEventListener('click', async () => {
  const name = playerNameInput.value.trim() || 'Anonymous';
  btnSaveScore.disabled = true;
  playerNameInput.disabled = true;
  saveStatus.textContent = 'Saving…';
  saveStatus.className = 'save-status';

  try {
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerName: name,
        score:   GameState.score,
        correct: GameState.correctAnswers,
        wrong:   GameState.wrongAnswers,
        pdfName: currentPdfName
      })
    });
    if (!res.ok) throw new Error(await res.text());
    saveStatus.textContent = `✅ Saved as "${name}"!`;
    fetchLeaderboard(); // refresh leaderboard to show new entry
  } catch (err) {
    saveStatus.textContent = `❌ Save failed: ${err.message}`;
    saveStatus.className = 'save-status error';
    btnSaveScore.disabled = false;
    playerNameInput.disabled = false;
  }
});

// Allow Enter key to save
playerNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') btnSaveScore.click();
});

// ── Fetch + Render Leaderboard ────────────────────────────────────────────────
async function fetchLeaderboard() {
  lbRows.innerHTML = '<p class="lb-loading">Loading…</p>';
  try {
    const res = await fetch('/api/leaderboard');
    const rows = await res.json();

    if (!rows.length) {
      lbRows.innerHTML = '<p class="lb-loading">No scores yet — be the first!</p>';
      return;
    }

    lbRows.innerHTML = '';
    const medals = ['gold', 'silver', 'bronze'];
    rows.forEach((row, i) => {
      const div = document.createElement('div');
      div.className = 'lb-row';

      const rankClass = medals[i] ? `lb-rank ${medals[i]}` : 'lb-rank';
      div.innerHTML = `
        <span class="${rankClass}">#${i + 1}</span>
        <span class="lb-name">${row.player_name}</span>
        <span class="lb-score">${row.score}</span>
        <span class="lb-date">${row.date}</span>
      `;
      lbRows.appendChild(div);
    });
  } catch (err) {
    lbRows.innerHTML = '<p class="lb-loading">Could not load leaderboard.</p>';
  }
}

btnRetry.addEventListener('click', () => {
  GameState.questionQueue = []; // clear stale queue, new questions will re-stream
  startGame();
});

btnBack.addEventListener('click', () => {
  clearInterval(questionCountdownTimer);
  clearInterval(answerTimer);
  engine?.stop();
  GameState.status = 'idle';
  window.removeEventListener('keydown', onKeyDown);
  gameCanvas.removeEventListener('click', onCanvasClick);
  showScreen('screen-upload');
});

btnNewPdf.addEventListener('click', () => {
  engine?.stop();
  GameState.questionQueue = [];
  selectedFile   = null;
  btnStart.disabled = true;
  fileNameDisplay.classList.add('hidden');
  uploadStatus.classList.add('hidden');
  pdfInput.value = '';
  showScreen('screen-upload');
});

// ── Init ──────────────────────────────────────────────────────────────────────
connectWebSocket();
showScreen('screen-upload');
