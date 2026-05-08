// ─── db.js ────────────────────────────────────────────────────────────────────
// Single Postgres connection pool + automatic table creation on startup
// ─────────────────────────────────────────────────────────────────────────────
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway Postgres requires SSL; local Postgres does not
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ── Auto-create tables if they don't exist ────────────────────────────────────
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id          SERIAL PRIMARY KEY,
        player_name TEXT         NOT NULL DEFAULT 'Anonymous',
        score       INTEGER      NOT NULL,
        correct     INTEGER      NOT NULL DEFAULT 0,
        wrong       INTEGER      NOT NULL DEFAULT 0,
        pdf_name    TEXT,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS question_cache (
        pdf_hash    TEXT  PRIMARY KEY,
        pdf_name    TEXT,
        questions   JSONB NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log('[DB] Tables ready ✓');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
