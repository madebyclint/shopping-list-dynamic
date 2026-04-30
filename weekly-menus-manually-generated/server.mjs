/**
 * Brooklyn Kitchen — Express server
 *
 * Serves the static site AND provides DB-backed content routes so all
 * menus, shopping lists, audits, and price data live in Railway Postgres
 * instead of only on disk.  Real-time cart sync is pushed to all open
 * browsers via Server-Sent Events (SSE).
 *
 * Environment variables (set in Railway):
 *   DATABASE_URL  — provided automatically by Railway Postgres
 *   PORT          — provided automatically by Railway (default 3000 locally)
 *
 * Tables
 * ──────
 *   cart_state      — live checklist state per week
 *   manifest        — current data.json (single row, id=1)
 *   weekly_menus    — one row per week: week_date, label, content_md
 *   shopping_lists  — one row per week: week_date, content_md
 *   shopping_audits — one row per trip: shopping_date, week_date, data (JSONB)
 *   documents       — key/value: meal-history, price-list, meals-ingredients,
 *                     price-history
 */

import express from 'express';
import pg      from 'pg';
import { fileURLToPath } from 'url';
import path    from 'path';
import { readFileSync } from 'fs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app  = express();
const PORT = process.env.PORT || 3000;

const { version } = JSON.parse(
  readFileSync(path.join(__dirname, 'package.json'), 'utf8'),
);
const DEPLOY_TIME = new Date().toISOString();
const ENV = process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV || 'local';

// ── Database ──────────────────────────────────────────────────────────────────
const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!DB_URL) {
  console.error('⚠️  No DATABASE_URL or POSTGRES_URL env var found — DB features will not work.');
} else {
  // Log a masked version so you can confirm which host is being used
  const masked = DB_URL.replace(/:([^:@]+)@/, ':***@');
  console.log('🗄️  DB connecting to:', masked);
}

const pool = new Pool({
  connectionString: DB_URL,
  ssl: DB_URL ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cart_state (
      week_key   TEXT        PRIMARY KEY,
      state      JSONB       NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS manifest (
      id         INT         PRIMARY KEY DEFAULT 1,
      data       JSONB       NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT manifest_single_row CHECK (id = 1)
    );
    CREATE TABLE IF NOT EXISTS weekly_menus (
      week_date   TEXT        PRIMARY KEY,
      label       TEXT,
      content_md  TEXT        NOT NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS shopping_lists (
      week_date   TEXT        PRIMARY KEY,
      content_md  TEXT        NOT NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS shopping_audits (
      shopping_date TEXT        PRIMARY KEY,
      week_date     TEXT,
      data          JSONB       NOT NULL,
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS documents (
      key        TEXT        PRIMARY KEY,
      content    TEXT        NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

initDb().catch(err => console.error('DB init error:', err));

// ── DB status diagnostic ──────────────────────────────────────────────────────
app.get('/api/db-status', async (_req, res) => {
  if (!DB_URL) {
    return res.status(503).json({ ok: false, error: 'no_db_url', detail: 'DATABASE_URL / POSTGRES_URL env var not set' });
  }
  try {
    const { rows } = await pool.query('SELECT NOW() AS now');
    const tableCheck = await pool.query(
      `SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_name = 'cart_state'`
    );
    res.json({ ok: true, db_time: rows[0].now, cart_state_table_exists: tableCheck.rows[0].n === '1' });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

// ── In-memory SSE clients  weekKey → Set<Response> ────────────────────────────
const sseClients = new Map();

function broadcast(weekKey, state, reqId) {
  const clients = sseClients.get(weekKey);
  if (!clients || clients.size === 0) return;
  const payload = `data: ${JSON.stringify({ state, reqId: reqId || null })}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { /* client disconnected */ }
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '64kb' }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Meta (version + deploy time) ─────────────────────────────────────────────
app.get('/api/meta', (_req, res) => {
  res.json({ version, deployedAt: DEPLOY_TIME, env: ENV });
});

// ── DB-backed content routes ──────────────────────────────────────────────────
// These intercept the same URLs the frontend already fetches, serving data
// from Postgres.  If the row doesn't exist yet they fall through to the
// static file on disk, so the app keeps working during / before migration.

// data.json  (manifest)
app.get('/data.json', async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT data FROM manifest WHERE id = 1');
    if (!rows[0]) return next();
    res.json(rows[0].data);
  } catch { next(); }
});

// menus/index.json  — rebuilt from weekly_menus table
app.get('/menus/index.json', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT week_date, label FROM weekly_menus ORDER BY week_date DESC',
    );
    if (!rows.length) return next();
    res.json({
      menus: rows.map(r => ({
        filename: `${r.week_date}-menu.md`,
        date:     r.week_date,
        label:    r.label || `Week of ${r.week_date}`,
      })),
    });
  } catch { next(); }
});

// menus/YYYY-MM-DD-menu.md
app.get('/menus/:filename', async (req, res, next) => {
  const m = req.params.filename.match(/^(\d{4}-\d{2}-\d{2})-menu\.md$/);
  if (!m) return next();
  try {
    const { rows } = await pool.query(
      'SELECT content_md FROM weekly_menus WHERE week_date = $1', [m[1]],
    );
    if (!rows[0]) return next();
    res.type('text/plain; charset=utf-8').send(rows[0].content_md);
  } catch { next(); }
});

// shopping-lists/YYYY-MM-DD-shopping-list.md
app.get('/shopping-lists/:filename', async (req, res, next) => {
  const m = req.params.filename.match(/^(\d{4}-\d{2}-\d{2})-shopping-list\.md$/);
  if (!m) return next();
  try {
    const { rows } = await pool.query(
      'SELECT content_md FROM shopping_lists WHERE week_date = $1', [m[1]],
    );
    if (!rows[0]) return next();
    res.type('text/plain; charset=utf-8').send(rows[0].content_md);
  } catch { next(); }
});

// shopping-audits/price-history.json  (must come before the :filename route)
app.get('/shopping-audits/price-history.json', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT content FROM documents WHERE key = 'price-history'",
    );
    if (!rows[0]) return next();
    res.type('application/json').send(rows[0].content);
  } catch { next(); }
});

// shopping-audits/YYYY-MM-DD-audit.json
app.get('/shopping-audits/:filename', async (req, res, next) => {
  const m = req.params.filename.match(/^(\d{4}-\d{2}-\d{2})-audit\.json$/);
  if (!m) return next();
  try {
    const { rows } = await pool.query(
      'SELECT data FROM shopping_audits WHERE shopping_date = $1', [m[1]],
    );
    if (!rows[0]) return next();
    res.json(rows[0].data);
  } catch { next(); }
});

// meal-history.md
app.get('/meal-history.md', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT content FROM documents WHERE key = 'meal-history'",
    );
    if (!rows[0]) return next();
    res.type('text/plain; charset=utf-8').send(rows[0].content);
  } catch { next(); }
});

// price-list.md
app.get('/price-list.md', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT content FROM documents WHERE key = 'price-list'",
    );
    if (!rows[0]) return next();
    res.type('text/plain; charset=utf-8').send(rows[0].content);
  } catch { next(); }
});

// meals-ingredients.json
app.get('/meals-ingredients.json', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT content FROM documents WHERE key = 'meals-ingredients'",
    );
    if (!rows[0]) return next();
    res.type('application/json').send(rows[0].content);
  } catch { next(); }
});

// Static files (index.html, price-trends.html, etc.) — fallback for anything
// not served from the DB above.
app.use(express.static(__dirname));

// ── GET /api/cart?week=YYYY-MM-DD ────────────────────────────────────────────
app.get('/api/cart', async (req, res) => {
  try {
    const weekKey = String(req.query.week || 'current').slice(0, 50);
    const { rows } = await pool.query(
      'SELECT state FROM cart_state WHERE week_key = $1',
      [weekKey],
    );
    res.json(rows[0]?.state ?? null);
  } catch (err) {
    console.error('GET /api/cart:', err.message);
    res.status(500).json({ error: 'db_error' });
  }
});

// ── POST /api/cart  body: { week, state } ─────────────────────────────────────
app.post('/api/cart', async (req, res) => {
  try {
    const weekKey = String(req.body.week || 'current').slice(0, 50);
    const state   = req.body.state;

    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      return res.status(400).json({ error: 'invalid_state' });
    }

    await pool.query(
      `INSERT INTO cart_state (week_key, state, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (week_key)
       DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`,
      [weekKey, JSON.stringify(state)],
    );

    const reqId = String(req.body.reqId || '').slice(0, 64) || null;

    // Push to all connected clients for this week (real-time sync)
    broadcast(weekKey, state, reqId);

    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/cart:', err.message);
    res.status(500).json({ error: 'db_error' });
  }
});

// ── GET /api/cart/events?week=YYYY-MM-DD  (Server-Sent Events) ────────────────
app.get('/api/cart/events', (req, res) => {
  const weekKey = String(req.query.week || 'current').slice(0, 50);

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // prevent nginx buffering
  res.flushHeaders();

  // Let the client know the connection is open
  res.write(': connected\n\n');

  // Register client
  if (!sseClients.has(weekKey)) sseClients.set(weekKey, new Set());
  sseClients.get(weekKey).add(res);

  // Heartbeat every 25 s keeps the connection alive through proxies / Railway
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { clearInterval(heartbeat); }
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.get(weekKey)?.delete(res);
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () =>
  console.log(`🥬 Brooklyn Kitchen running on http://localhost:${PORT}`),
);
