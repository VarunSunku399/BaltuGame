// ─── agentDB.js ───────────────────────────────────────────────────────────────
// Database Agent — all SQL queries in one place
// ─────────────────────────────────────────────────────────────────────────────
const { pool } = require('./db');

// ── Leaderboard ───────────────────────────────────────────────────────────────

/**
 * Save a completed game session to the leaderboard
 */
async function saveSession({ playerName, score, correct, wrong, pdfName }) {
  await pool.query(
    `INSERT INTO sessions (player_name, score, correct, wrong, pdf_name)
     VALUES ($1, $2, $3, $4, $5)`,
    [playerName || 'Anonymous', score, correct, wrong, pdfName || 'Unknown PDF']
  );
}

/**
 * Get top 10 scores for the leaderboard
 */
async function getLeaderboard() {
  const { rows } = await pool.query(
    `SELECT player_name, score, correct, wrong, pdf_name,
            TO_CHAR(created_at AT TIME ZONE 'UTC', 'Mon DD, YYYY') AS date
     FROM sessions
     ORDER BY score DESC
     LIMIT 10`
  );
  return rows;
}

// ── Question Cache ────────────────────────────────────────────────────────────

/**
 * Check if questions for this PDF hash already exist in cache
 * @returns {Array|null} cached questions array, or null if not found
 */
async function getCachedQuestions(pdfHash) {
  const { rows } = await pool.query(
    `SELECT questions FROM question_cache WHERE pdf_hash = $1`,
    [pdfHash]
  );
  return rows.length > 0 ? rows[0].questions : null;
}

/**
 * Save AI-generated questions to the cache
 */
async function saveQuestionsToCache(pdfHash, pdfName, questions) {
  await pool.query(
    `INSERT INTO question_cache (pdf_hash, pdf_name, questions)
     VALUES ($1, $2, $3)
     ON CONFLICT (pdf_hash) DO UPDATE SET questions = $3`,
    [pdfHash, pdfName, JSON.stringify(questions)]
  );
}

module.exports = { saveSession, getLeaderboard, getCachedQuestions, saveQuestionsToCache };
