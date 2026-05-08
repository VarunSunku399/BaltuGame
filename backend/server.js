// ─── Orchestrator Agent ───────────────────────────────────────────────────────
// Connects: PDF Upload → PDF Agent → Question Agent → WebSocket stream to Game
// Also manages Postgres: question cache + leaderboard sessions
// ─────────────────────────────────────────────────────────────────────────────
require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const multer   = require('multer');
const http     = require('http');
const crypto   = require('crypto');
const path     = require('path');
const { WebSocketServer } = require('ws');

const { processPDF }                = require('./agentPDF');
const { generateQuestionsFromChunk } = require('./agentQuestion');
const { initDB }                    = require('./db');
const { saveSession, getLeaderboard, getCachedQuestions, saveQuestionsToCache } = require('./agentDB');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ── Multer ────────────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  }
});

// ── WebSocket clients ─────────────────────────────────────────────────────────
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[WS] Client connected. Total: ${clients.size}`);
  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected. Total: ${clients.size}`);
  });
});

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

// ── Stream questions to game ──────────────────────────────────────────────────
async function streamQuestionsToGame(questions, intervalMs = 12000) {
  for (let i = 0; i < questions.length; i++) {
    await new Promise(resolve => setTimeout(resolve, i === 0 ? 3000 : intervalMs));
    console.log(`[Orchestrator] Streaming question ${i + 1}/${questions.length}:`, questions[i].question);
    broadcast({ type: 'QUESTION', payload: questions[i] });
  }
  broadcast({ type: 'GAME_COMPLETE', payload: { message: 'All questions delivered!' } });
}

// ── REST: PDF Upload ──────────────────────────────────────────────────────────
app.post('/api/upload', upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No PDF uploaded' });

  const pdfName = req.file.originalname;
  // Hash the PDF content to use as cache key
  const pdfHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

  try {
    // ── Check question cache first ─────────────────────────────────────────────
    broadcast({ type: 'STATUS', payload: { message: '🔍 Checking question cache…' } });
    const cached = await getCachedQuestions(pdfHash);

    if (cached) {
      console.log(`[DB] Cache hit! ${cached.length} questions loaded instantly for "${pdfName}"`);
      broadcast({ type: 'STATUS', payload: { message: `⚡ Loaded ${cached.length} questions from cache instantly!` } });
      broadcast({ type: 'QUESTIONS_READY', payload: { total: cached.length, fromCache: true } });
      res.json({ success: true, total: cached.length, fromCache: true });
      streamQuestionsToGame(cached);
      return;
    }

    // ── Cache miss — run the full AI pipeline ─────────────────────────────────
    broadcast({ type: 'STATUS', payload: { message: '📄 PDF received. Extracting text…' } });
    const chunks = await processPDF(req.file.buffer);
    console.log(`[PDF Agent] Extracted ${chunks.length} chunks from "${pdfName}"`);
    broadcast({ type: 'STATUS', payload: { message: `🧩 Extracted ${chunks.length} chunks. Generating questions…` } });

    const selectedChunks = chunks.slice(0, 5);
    const allQuestions = [];
    for (const chunk of selectedChunks) {
      const qs = await generateQuestionsFromChunk(chunk);
      allQuestions.push(...qs);
    }

    console.log(`[Question Agent] Generated ${allQuestions.length} questions`);

    // ── Save to cache so next upload is instant ────────────────────────────────
    await saveQuestionsToCache(pdfHash, pdfName, allQuestions);
    console.log(`[DB] Saved ${allQuestions.length} questions to cache for "${pdfName}"`);

    broadcast({ type: 'STATUS', payload: { message: `🎯 ${allQuestions.length} questions ready! Get set…` } });
    broadcast({ type: 'QUESTIONS_READY', payload: { total: allQuestions.length, fromCache: false } });

    res.json({ success: true, total: allQuestions.length, fromCache: false });
    streamQuestionsToGame(allQuestions);

  } catch (err) {
    console.error('[Orchestrator] Error:', err);
    broadcast({ type: 'ERROR', payload: { message: err.message } });
    res.status(500).json({ error: err.message });
  }
});

// ── REST: Save session (called by frontend on game over) ──────────────────────
app.post('/api/session', async (req, res) => {
  try {
    const { playerName, score, correct, wrong, pdfName } = req.body;
    await saveSession({ playerName, score, correct, wrong, pdfName });
    console.log(`[DB] Session saved — ${playerName}: ${score} pts`);
    res.json({ success: true });
  } catch (err) {
    console.error('[DB] Save session error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── REST: Leaderboard ─────────────────────────────────────────────────────────
app.get('/api/leaderboard', async (req, res) => {
  try {
    const rows = await getLeaderboard();
    res.json(rows);
  } catch (err) {
    console.error('[DB] Leaderboard error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Fallback ──────────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

initDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`\n🦖 BaltuGame Orchestrator running → http://localhost:${PORT}`);
      console.log(`📡 WebSocket ready on ws://localhost:${PORT}`);
      console.log(`🔑 Gemini key: ${process.env.GEMINI_API_KEY ? 'SET ✓' : 'NOT SET'}`);
      console.log(`🗄️  Postgres: ${process.env.DATABASE_URL ? 'CONNECTED ✓' : 'NOT SET'}\n`);
    });
  })
  .catch(err => {
    console.error('❌ Failed to connect to Postgres:', err.message);
    console.error('   Check DATABASE_URL in your .env file\n');
    process.exit(1);
  });
