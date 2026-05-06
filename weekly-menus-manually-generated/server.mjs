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
import { readFileSync, existsSync, readdirSync } from 'fs';

// ── Load .env.local as fallback when env vars are missing (local dev) ─────────
if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  const envFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env.local');
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

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
    CREATE TABLE IF NOT EXISTS item_prices (
      name       TEXT        PRIMARY KEY,
      price      NUMERIC     NOT NULL,
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

// ── GET /api/item-prices  ─────────────────────────────────────────────────────
app.get('/api/item-prices', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT name, price FROM item_prices');
    const result = {};
    for (const r of rows) result[r.name] = parseFloat(r.price);
    res.json(result);
  } catch (err) {
    console.error('GET /api/item-prices:', err.message);
    res.status(500).json({ error: 'db_error' });
  }
});

// ── PUT /api/item-prices  body: { name, price } ────────────────────────────────
app.put('/api/item-prices', async (req, res) => {
  try {
    const name  = String(req.body.name  || '').slice(0, 200).trim();
    const price = parseFloat(req.body.price);
    if (!name || isNaN(price) || price < 0) {
      return res.status(400).json({ error: 'invalid_params' });
    }
    await pool.query(
      `INSERT INTO item_prices (name, price, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (name)
       DO UPDATE SET price = EXCLUDED.price, updated_at = NOW()`,
      [name, price],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/item-prices:', err.message);
    res.status(500).json({ error: 'db_error' });
  }
});

// Strip trailing " (4/17 — tx1)" / " (3/21)" style suffixes from old store names.
// Only removes a trailing parenthetical whose first char is a digit (date-like).
// Also merges known aliases to a canonical name.
const STORE_ALIASES = {
  'ideal foods': 'Ideal Food Basket',
  'ideal food basket': 'Ideal Food Basket',
};
function normalizeStore(name) {
  const stripped = String(name).replace(/\s*\(\d[^)]*\)\s*$/, '').trim();
  return STORE_ALIASES[stripped.toLowerCase()] ?? stripped;
}
// Merge a by_store object, normalizing all keys and summing amounts.
function normByStore(bs) {
  if (!bs || typeof bs !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(bs)) {
    const nk = normalizeStore(k);
    out[nk] = parseFloat(((out[nk] || 0) + v).toFixed(2));
  }
  return out;
}

// ── GET /api/audits — all trips for reporting ─────────────────────────────────
app.get('/api/audits', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT week_date, data FROM shopping_audits ORDER BY week_date DESC',
    );
    // Normalize old format (total_spent / list_estimate) to new (actual / budget)
    res.json(rows.map(r => {
      const d = r.data || {};
      return {
        week:            r.week_date,
        budget:          d.budget          ?? d.list_estimate       ?? 0,
        actual:          d.actual          ?? d.total_spent         ?? null,
        checklist_total: d.checklist_total ?? d.on_list_total_est   ?? null,
        item_count:           d.item_count           ?? null,
        budget_item_count:    d.budget_item_count    ?? null,
        receipt_line_items:   d.receipt_line_items   ?? null,
        by_store:        normByStore(d.by_store ?? {}),
        variance:        d.variance        ?? (
          (d.actual ?? d.total_spent ?? null) != null
            ? (d.actual ?? d.total_spent) - (d.budget ?? d.list_estimate ?? 0)
            : null
        ),
      };
    }));
  } catch (err) {
    console.error('GET /api/audits:', err.message);
    res.status(500).json({ error: 'db_error' });
  }
});

// ── POST /api/audits — two modes: receipt entry OR checklist auto-save ─────────
// Receipt mode:   { week, store, receipt_amount }       — sets store → amount in by_store
// Checklist mode: { week, budget, checklist_total, item_count } — updates estimates only
app.post('/api/audits', async (req, res) => {
  try {
    const week = String(req.body.week || '').slice(0, 20).trim();
    if (!week) return res.status(400).json({ error: 'week_required' });

    // Fetch existing row so we can merge
    const { rows } = await pool.query(
      'SELECT data FROM shopping_audits WHERE shopping_date = $1', [week],
    );
    const existing = rows[0]?.data || {};

    let data;
    if (req.body.store != null && req.body.receipt_amount != null) {
      // ── Receipt entry mode ──────────────────────────────────────────────────
      const store  = normalizeStore(String(req.body.store).slice(0, 150));
      const amount = parseFloat(req.body.receipt_amount);
      if (!store || isNaN(amount) || amount < 0) {
        return res.status(400).json({ error: 'invalid_params' });
      }
      const by_store = normByStore(existing.by_store || {});
      by_store[store] = parseFloat(amount.toFixed(2));  // replaces existing amount for this store
      const actual = parseFloat(
        Object.values(by_store).reduce((s, v) => s + v, 0).toFixed(2),
      );
      // If this row has no budget, pull it from the nearest row within ±14 days
      // (handles the case where a receipt date differs from the checklist week key).
      let budget = existing.budget || 0;
      if (!budget) {
        const { rows: nearby } = await pool.query(
          `SELECT data FROM shopping_audits
           WHERE shopping_date != $1
             AND (data->>'budget')::numeric > 0
           ORDER BY ABS(shopping_date::date - $1::date)
           LIMIT 1`,
          [week],
        );
        if (nearby.length > 0) budget = parseFloat(nearby[0].data?.budget) || 0;
      }
      const lineItems = req.body.receipt_line_items != null
        ? parseInt(req.body.receipt_line_items, 10) : undefined;
      data = {
        ...existing,
        by_store,
        actual,
        variance: parseFloat((actual - budget).toFixed(2)),
        ...(lineItems > 0 ? { receipt_line_items: lineItems } : {}),
      };
    } else {
      // ── Checklist auto-save mode ────────────────────────────────────────────
      const budget              = typeof req.body.budget              === 'number' ? req.body.budget              : (existing.budget ?? 0);
      const budget_item_count   = typeof req.body.budget_item_count   === 'number' ? req.body.budget_item_count   : (existing.budget_item_count ?? null);
      const checklist_total     = typeof req.body.checklist_total     === 'number' ? req.body.checklist_total     : (existing.checklist_total ?? null);
      const item_count          = typeof req.body.item_count          === 'number' ? req.body.item_count          : (existing.item_count ?? 0);
      // Never overwrite receipt-entered actual / by_store
      const actual = existing.actual ?? null;
      data = {
        ...existing,
        budget,
        budget_item_count,
        checklist_total,
        item_count,
        actual,
        variance: actual != null
          ? parseFloat((actual   - budget).toFixed(2))
          : parseFloat(((checklist_total ?? 0) - budget).toFixed(2)),
      };
    }

    await pool.query(
      `INSERT INTO shopping_audits (shopping_date, week_date, data, updated_at)
       VALUES ($1, $1, $2, NOW())
       ON CONFLICT (shopping_date)
       DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [week, JSON.stringify(data)],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/audits:', err.message);
    res.status(500).json({ error: 'db_error' });
  }
});

// ── GET /api/audit-stores — distinct store names for autocomplete ──────────────
app.get('/api/audit-stores', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT data FROM shopping_audits');
    const stores = new Set();
    for (const r of rows) {
      const bs = r.data?.by_store;
      if (bs && typeof bs === 'object') Object.keys(bs).forEach(k => stores.add(normalizeStore(k)));
    }
    res.json([...stores].sort());
  } catch (err) {
    console.error('GET /api/audit-stores:', err.message);
    res.status(500).json({ error: 'db_error' });
  }
});

// ── DELETE /api/audits/:date — remove a single trip record ──────────────────────
app.delete('/api/audits/:date', async (req, res) => {
  try {
    const date = String(req.params.date || '').slice(0, 20).trim();
    if (!date) return res.status(400).json({ error: 'date_required' });
    const { rowCount } = await pool.query(
      'DELETE FROM shopping_audits WHERE shopping_date = $1', [date],
    );
    res.json({ ok: true, deleted: rowCount });
  } catch (err) {
    console.error('DELETE /api/audits:', err.message);
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

// ── Meal Ideas API ────────────────────────────────────────────────────────────

async function ensureMealIdeasTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS meal_ideas (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      cuisine_type VARCHAR(100),
      notes TEXT,
      is_favorite BOOLEAN DEFAULT false,
      usage_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS next_week_notes (
      id SERIAL PRIMARY KEY,
      content TEXT NOT NULL,
      note_type VARCHAR(50) NOT NULL DEFAULT 'general',
      week_date DATE,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  // Add include_in_prompt column if it doesn't exist yet (safe migration)
  await pool.query(`
    ALTER TABLE meal_ideas ADD COLUMN IF NOT EXISTS include_in_prompt BOOLEAN DEFAULT false;
  `);
}
ensureMealIdeasTables().catch(e => console.error('meal_ideas table init error:', e));

app.get('/api/meal-ideas', async (req, res) => {
  try {
    const favOnly = req.query.favorites === 'true';
    const q = favOnly
      ? 'SELECT * FROM meal_ideas WHERE is_favorite = true ORDER BY created_at DESC'
      : 'SELECT * FROM meal_ideas ORDER BY is_favorite DESC, created_at DESC';
    const { rows } = await pool.query(q);
    res.json({ ideas: rows });
  } catch (err) {
    console.error('GET /api/meal-ideas:', err.message);
    res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/meal-ideas', async (req, res) => {
  try {
    const { title, description, cuisine_type, notes, is_favorite } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'title required' });
    const { rows } = await pool.query(
      `INSERT INTO meal_ideas (title, description, cuisine_type, notes, is_favorite)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [title.trim(), description || null, cuisine_type || null, notes || null, !!is_favorite]
    );
    res.status(201).json({ idea: rows[0] });
  } catch (err) {
    console.error('POST /api/meal-ideas:', err.message);
    res.status(500).json({ error: 'db_error' });
  }
});

app.patch('/api/meal-ideas/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const allowed = ['title','description','cuisine_type','notes','is_favorite','include_in_prompt'];
    const fields = [], vals = [];
    for (const [k, v] of Object.entries(req.body)) {
      if (allowed.includes(k)) { fields.push(`${k} = $${fields.length + 1}`); vals.push(v); }
    }
    if (!fields.length) return res.status(400).json({ error: 'no valid fields' });
    vals.push(id);
    const { rows } = await pool.query(
      `UPDATE meal_ideas SET ${fields.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals
    );
    res.json({ idea: rows[0] });
  } catch (err) {
    console.error('PATCH /api/meal-ideas:', err.message);
    res.status(500).json({ error: 'db_error' });
  }
});

app.delete('/api/meal-ideas/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM meal_ideas WHERE id = $1', [parseInt(req.params.id, 10)]);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/meal-ideas:', err.message);
    res.status(500).json({ error: 'db_error' });
  }
});

// ── Next Week Notes API ───────────────────────────────────────────────────────

app.get('/api/next-week-notes', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM next_week_notes WHERE is_active = true ORDER BY created_at DESC`
    );
    res.json({ notes: rows });
  } catch (err) {
    console.error('GET /api/next-week-notes:', err.message);
    res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/next-week-notes', async (req, res) => {
  try {
    const { content, note_type, week_date } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'content required' });
    const { rows } = await pool.query(
      `INSERT INTO next_week_notes (content, note_type, week_date)
       VALUES ($1,$2,$3) RETURNING *`,
      [content.trim(), note_type || 'general', week_date || null]
    );
    res.status(201).json({ note: rows[0] });
  } catch (err) {
    console.error('POST /api/next-week-notes:', err.message);
    res.status(500).json({ error: 'db_error' });
  }
});

app.patch('/api/next-week-notes/:id', async (req, res) => {
  try {
    await pool.query('UPDATE next_week_notes SET is_active = false WHERE id = $1', [parseInt(req.params.id, 10)]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'db_error' });
  }
});

app.put('/api/next-week-notes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { content, note_type, week_date } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'content required' });
    const { rows } = await pool.query(
      `UPDATE next_week_notes SET content = $1, note_type = $2, week_date = $3 WHERE id = $4 RETURNING *`,
      [content.trim(), note_type || 'general', week_date || null, id]
    );
    res.json({ note: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'db_error' });
  }
});

app.delete('/api/next-week-notes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM next_week_notes WHERE id = $1', [parseInt(req.params.id, 10)]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'db_error' });
  }
});

// ── Prompt Generator API ──────────────────────────────────────────────────────

function pgNextMonday() {
  const today = new Date();
  const day = today.getDay();
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7;
  const next = new Date(today);
  next.setDate(today.getDate() + daysUntilMonday);
  return next.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function pgGetRecentMeals(weeksBack = 6) {
  const historyPath = path.join(__dirname, 'meal-history.md');
  if (!existsSync(historyPath)) return [];
  const text = readFileSync(historyPath, 'utf8');
  const weekBlocks = text.split(/^## Week of /m).slice(1);
  const meals = [];
  for (const block of weekBlocks.slice(0, weeksBack)) {
    const lines = block.split('\n');
    let inDinners = false;
    for (const line of lines) {
      if (/^### Dinners/i.test(line)) { inDinners = true; continue; }
      if (/^### /i.test(line)) { inDinners = false; continue; }
      if (inDinners && line.startsWith('- ')) {
        const name = line.replace(/^- /, '').split(' — ')[0].replace(/\*[^*]*\*/g, '').trim();
        if (name && !name.startsWith('*(')) meals.push(name);
      }
    }
  }
  return meals;
}

app.get('/api/generate-prompt', async (_req, res) => {
  try {
    const weekDate = pgNextMonday();
    const recentMeals = pgGetRecentMeals(6);

    // Get ideas marked for prompt
    const ideasRes = await pool.query(
      `SELECT title, cuisine_type, notes FROM meal_ideas WHERE include_in_prompt = true ORDER BY created_at`
    );
    const includedIdeas = ideasRes.rows;

    // Get active next-week notes
    const notesRes = await pool.query(
      `SELECT content, note_type FROM next_week_notes WHERE is_active = true ORDER BY created_at`
    );
    const activeNotes = notesRes.rows;

    // Build optional context blocks
    let ideasBlock = '';
    if (includedIdeas.length) {
      const lines = includedIdeas.map(i => {
        let line = `- ${i.title}`;
        if (i.cuisine_type) line += ` (${i.cuisine_type})`;
        if (i.notes) line += `\n  Notes: ${i.notes}`;
        return line;
      }).join('\n');
      ideasBlock = `\n**Meal ideas to consider this week (please include 1–3 of these where they fit):**\n${lines}\n`;
    }

    let notesBlock = '';
    if (activeNotes.length) {
      const grouped = {};
      for (const n of activeNotes) (grouped[n.note_type] = grouped[n.note_type] || []).push(n.content);
      const lines = [];
      if (grouped.meal_request?.length)          lines.push(`Requested meals: ${grouped.meal_request.join('; ')}`);
      if (grouped.must_use_ingredient?.length)   lines.push(`Must-use ingredients: ${grouped.must_use_ingredient.join('; ')}`);
      if (grouped.dietary_note?.length)          lines.push(`Dietary notes: ${grouped.dietary_note.join('; ')}`);
      if (grouped.constraint?.length)            lines.push(`Constraints: ${grouped.constraint.join('; ')}`);
      if (grouped.general?.length)              lines.push(`Other notes: ${grouped.general.join('; ')}`);
      notesBlock = `\n**This week's specific notes (please honor these):**\n${lines.map(l => `- ${l}`).join('\n')}\n`;
    }

    const prompt = `I need a meal plan for the next week. Here is the criteria:

1. Needs to be 5 dinners to cook + 1 breakfast
2. Keep them to under an hour to make, preferably closer to 30 min
3. Keep them budget friendly
4. Diversify the meals (cuisine) — don't be shy about non-mainstream, think outside the box, and **avoid repeating the same cuisine twice in one week**
5. Rainbow plate mentality — always a serving of veggie and protein. Veggie proteins are ok too. **Every meal must include a fresh fruit as a side** — list it in both the meal summary and ingredients. Pick fruits that pair with the cuisine where possible.
6. If we do pork, we need to do a pork portion and a non-pork portion for a couple family members.
7. We are a family of 4 with two teens
8. **Tuesday must be a super fast meal (≤20 min)** — we get home at 8pm. Think mac and cheese, hot dogs, quesadillas, charcuterie board, ramen, grilled cheese, etc. No-cook is fine but not required — speed is the priority.
9. **Thursday must be a kid-friendly prep meal** — the teens make it themselves. Keep it simple with clear steps (tacos, pasta, stir fry, sheet pan, etc.)

**Health goals to keep in mind (soft guidelines, not hard rules):**
- Reduce bloating: pull back on high-FODMAP ingredients (onions, garlic, beans, cruciferous veggies) where possible — don't eliminate, just don't lead with them. Prefer meals that are easy to digest on weeknights.
- Weight loss: protein at every meal, half the plate veggies, sensible portions. Ginger, lemon/lime, avocado, sweet potato, and banana are all good additions where they fit naturally.
- Lighter weeknight dinners preferred — the family does a short walk after dinner.

**Context:**
- Week of ${weekDate}
- Recent meals to avoid repeating (last 6 weeks): ${recentMeals.join(', ')}
- We are in Brooklyn buying at small markets (higher prices than chain stores)
${ideasBlock}${notesBlock}
**Pantry staples — do NOT add these to the shopping list:**
- Olive oil, vegetable oil, canola oil, butter
- Soy sauce, fish sauce, rice vinegar, sesame oil
- Chicken broth, vegetable broth
- Salt, black pepper, red pepper flakes
- Cumin, paprika, chili powder, garlic powder, oregano, turmeric, coriander, cinnamon, bay leaves
- Jasmine rice, all-purpose flour, sugar
- Canned tomatoes, tomato paste, canned chickpeas, black beans, kidney beans
- Couscous, pasta
- Hot sauce, Worcestershire sauce, ketchup
- Fresh garlic, fresh ginger

**Weekly recurring items — always include in the shopping list:**
- Chips (2 bags — always specify type, e.g. tortilla, salt & vinegar; note the meal if applicable)
- Cereal (2 boxes)
- Lactaid whole milk (1 half-gallon)
- Almond milk (1 gallon)
- Eggs (1 dozen)
- Assorted fresh fruit (~$10–$15)
- Ice cream (1 container)
- Trail mix (1 bag)
- Mango juice (1 bottle/carton)
- Condensed milk (1 can)
- Toilet paper (1 pack)
- Paper towels (1 pack)

---

Please present 5 dinners + 1 breakfast for approval first (name + key components + estimated time), label which is **Tuesday (fast/easy)** and which is **Thursday (kids prep)**, then after I confirm generate the full output.`;

    res.json({ prompt, weekDate, recentMeals, includedIdeas: includedIdeas.map(i => i.title), activeNotes });
  } catch (err) {
    console.error('GET /api/generate-prompt:', err.message);
    res.status(500).json({ error: 'db_error' });
  }
});

// ── Past Meal Search API ──────────────────────────────────────────────────────
app.get('/api/search-past-meals', (_req, res) => {
  const q = ((_req.query.q) || '').toLowerCase().trim();
  if (!q || q.length < 2) return res.json({ results: [] });

  const menusDir = path.join(__dirname, 'menus');
  const results = [];

  let files = [];
  try { files = readdirSync(menusDir).filter(f => f.endsWith('.md') && f !== 'README.md').sort().reverse(); }
  catch { return res.json({ results: [] }); }

  for (const file of files) {
    const text = readFileSync(path.join(menusDir, file), 'utf8');
    // Split by the bold meal name pattern: **Meal Name** *(Day...)*
    const mealBlocks = text.split(/^(?=\*\*[^*]+\*\*\s*\*\()/m).slice(1);
    for (const block of mealBlocks) {
      const titleMatch = block.match(/^\*\*([^*]+)\*\*/);
      if (!titleMatch) continue;
      const title = titleMatch[1].trim();
      if (!title.toLowerCase().includes(q)) continue;
      // Extract cooking overview steps
      const overviewMatch = block.match(/\*\*Cooking Overview\*\*\s*\n([\s\S]*?)(?=\n---|\n\*\*[A-Z]|\n##|$)/);
      const cookingSteps = overviewMatch ? overviewMatch[1].trim() : null;
      // Get week date from filename
      const weekDate = file.replace('-menu.md', '');
      results.push({ title, weekDate, cookingSteps, file });
      if (results.length >= 8) break;
    }
    if (results.length >= 8) break;
  }

  res.json({ results });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () =>
  console.log(`🥬 Brooklyn Kitchen running on http://localhost:${PORT}`),
);
