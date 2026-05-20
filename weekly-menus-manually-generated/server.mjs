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
    CREATE TABLE IF NOT EXISTS special_events (
      id               SERIAL PRIMARY KEY,
      name             TEXT NOT NULL,
      date             TEXT NOT NULL,
      slug             TEXT UNIQUE NOT NULL,
      week             TEXT,
      budget           NUMERIC(10,2) DEFAULT 0,
      total_spent      NUMERIC(10,2) DEFAULT 0,
      by_store         JSONB DEFAULT '{}',
      shopping_list_md TEXT,
      recipes_md       TEXT,
      prep_md          TEXT,
      packing_list_md  TEXT,
      notes            TEXT,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS pantry_recipes (
      id          SERIAL      PRIMARY KEY,
      name        TEXT        NOT NULL,
      category    TEXT,
      yield_desc  TEXT,
      keeps_desc  TEXT,
      recipe_md   TEXT,
      ingredients JSONB       DEFAULT '[]',
      notes       TEXT,
      source_url  TEXT,
      last_made   TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  // Safe migrations for existing installs
  await pool.query(`
    ALTER TABLE special_events ADD COLUMN IF NOT EXISTS packing_list_md TEXT;
    ALTER TABLE pantry_recipes  ADD COLUMN IF NOT EXISTS source_url TEXT;
  `);
}

initDb()
  .then(() => seedKamayanFeast())
  .catch(err => console.error('DB init error:', err));

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

// ── GET /api/audits — all trips for reporting (includes special event spend) ───
app.get('/api/audits', async (_req, res) => {
  try {
    const [auditsResult, eventsResult] = await Promise.all([
      pool.query('SELECT week_date, data FROM shopping_audits ORDER BY week_date DESC'),
      pool.query('SELECT id, name, week, budget, total_spent, by_store FROM special_events WHERE total_spent > 0 ORDER BY week DESC'),
    ]);

    // Build week map from audit rows
    const weekMap = new Map();
    for (const r of auditsResult.rows) {
      const d = r.data || {};
      weekMap.set(r.week_date, {
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
      });
    }

    // Merge special event spend into matching week rows (or create synthetic rows)
    for (const ev of eventsResult.rows) {
      const spent    = parseFloat(ev.total_spent || 0);
      const weekKey  = ev.week || '';
      const storeKey = `🎉 ${ev.name}`;
      if (weekMap.has(weekKey)) {
        const row = weekMap.get(weekKey);
        row.by_store[storeKey] = spent;
        row.actual = parseFloat(((row.actual || 0) + spent).toFixed(2));
        row.variance = parseFloat((row.actual - row.budget).toFixed(2));
      } else if (weekKey) {
        weekMap.set(weekKey, {
          week:            weekKey,
          budget:          parseFloat(ev.budget || 0),
          actual:          spent,
          checklist_total: null,
          item_count:      null,
          budget_item_count: null,
          receipt_line_items: null,
          by_store:        { [storeKey]: spent },
          variance:        parseFloat((spent - parseFloat(ev.budget || 0)).toFixed(2)),
          special_event_only: true,
        });
      }
    }

    const result = [...weekMap.values()].sort((a, b) => b.week.localeCompare(a.week));
    res.json(result);
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

    // Get pantry recipes
    const pantryRes = await pool.query(
      `SELECT name, category, yield_desc, keeps_desc, notes, source_url FROM pantry_recipes ORDER BY name`
    );
    const pantryItems = pantryRes.rows;

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

    let pantryBlock = '';
    if (pantryItems.length) {
      const lines = pantryItems.map(p => {
        let line = `- **${p.name}**`;
        if (p.category) line += ` (${p.category})`;
        if (p.yield_desc) line += ` — ${p.yield_desc}`;
        if (p.keeps_desc) line += ` · keeps ${p.keeps_desc}`;
        if (p.source_url) line += ` · recipe: ${p.source_url}`;
        if (p.notes) line += `\n  Notes: ${p.notes.split('\n')[0]}`;
        return line;
      }).join('\n');
      pantryBlock = `\n**Homemade pantry items available (already made — do NOT add their ingredients to the shopping list. Feel free to suggest using them in meals or as condiments):**\n${lines}\n`;
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
${ideasBlock}${notesBlock}${pantryBlock}
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

Please present 5 dinners + 1 breakfast for approval first (name + key components + estimated time), label which is **Tuesday (fast/easy)** and which is **Thursday (kids prep)**, then after I confirm generate the full output in these sections:

**FILE 1 — \`menus/YYYY-MM-DD-menu.md\`**

Use the Monday date for the filename. Structure:
\`\`\`
# Menu — [Week Label]

## Quick Glance Meals

### Sun–Fri Plan
- [emoji] [Meal Name] *([DAY LABEL, Date])* — [key components] — [fruit side] — [X] min
...

### For Following Week
(optional ideas)

[One short narrative paragraph summarizing the week's theme/flow]

---

## Deeper View

**[Meal Name]** *([Day, Date])*
Total time: ~X min · Approx calories: ~XXX per adult

> [1–2 sentence flavor/background note]

**Ingredients Used**

- Ingredient
- [Fruit] (served on the side)

**Cooking Overview**

1. Step
2. Step

---
\`\`\`
Format rules: title + day on same line; blank line after bold labels before lists; numbered steps only; fruit in both Quick Glance and Ingredients Used.

**FILE 2 — \`shopping-lists/YYYY-MM-DD-shopping-list.md\`**

\`\`\`
# Shopping List — [Date Range] — ~$XXX

> [Notes blurb: where to find specialty items, substitutes, tips]

---

🥬 **PRODUCE**
- Item (qty) — Meal Name — ~$price ea — **~$total**
...
Produce Subtotal: **~$XX.XX**

🥩 **PROTEINS**
...

🧀 **DAIRY & REFRIGERATED**
...

🛒 **PANTRY & DRY GOODS**
...

🧻 **HOUSEHOLD**
...

🛍 **WEEKLY STAPLES**
...

---
| Category | Est. Total |
|---|---|
| Produce | $XX |
| **GRAND TOTAL** | **~$XXX** |
\`\`\`
Every line item includes the meal it's for. After the grand total, add:
\`\`\`
## Shopping List by Trip

### [Store Name]

**— Produce —**
- Item (qty) — Meal Name

**— Proteins —**
- Item (qty) — Meal Name

**— Dairy —**
- Item (qty) — Meal Name

**— Aisles —**
- Item (qty) — Meal Name or weekly

**— Household —**
- Item (qty) — weekly
\`\`\`

**FILE 3 — \`data.json\` currentWeek block**

Output only the updated \`currentWeek\` JSON block:
\`\`\`json
"currentWeek": "YYYY-MM-DD",
"weekLabel": "Sun Mon D - Fri Mon D, YYYY",
"shoppingDate": "YYYY-MM-DD",
"files": {
  "menu": "menus/YYYY-MM-DD-menu.md",
  "shoppingList": "shopping-lists/YYYY-MM-DD-shopping-list.md"
},
"meals": [
  { "name": "...", "day": "Sunday, Mon D", "emoji": "...", "time": "X min", "tag": "", "tagType": "" }
]
\`\`\`
tagType values: "fast" (Tuesday), "teen" (Thursday), "special", "" (none).

**FILE 4 — \`meal-history.md\` entry**

\`\`\`
## [Week Label]

### Dinners
- [emoji] [Meal Name] *([DAY LABEL])* — key components — X min

### Breakfast / Brunch
- [emoji] [Meal Name] *([DAY LABEL])* — key components — X min

### Notes
- Any substitutions or "For Following Week" ideas
\`\`\`

**FILE 5 — \`menus/index.json\` entry**

\`\`\`json
{ "filename": "YYYY-MM-DD-menu.md", "date": "YYYY-MM-DD", "label": "Week of Month D, YYYY" }
\`\`\`

**FILE 6 — \`meals-ingredients.json\` (FULL FILE REPLACEMENT)**

\`\`\`json
{
  "week": "YYYY-MM-DD",
  "meals": [
    {
      "name": "Exact Meal Name from data.json",
      "day": "Monday",
      "emoji": "🍽",
      "buy_these": ["Every ingredient from the shopping list for this meal"],
      "pantry": ["Oil, salt, garlic, broth, pantry spices assumed at home"]
    }
  ]
}
\`\`\`

**FILE 7 — MACHINE-READABLE IMPORT BLOCK**

After all files above, output this exact block so the dashboard can auto-import the week:

\`\`\`
<!--WEEK_IMPORT_START-->
{
  "weekDate": "YYYY-MM-DD",
  "weekLabel": "Week of Mon May 11 - Fri May 16, 2026",
  "shoppingDate": "YYYY-MM-DD",
  "meals": [
    { "name": "...", "day": "Monday, May 11", "emoji": "...", "time": "X min", "tag": "", "tagType": "" }
  ],
  "mealHistoryEntry": "## Week of ...\\n\\n### Dinners\\n- ...\\n\\n### Breakfast / Brunch\\n- ...\\n\\n### Notes\\n- ...",
  "followingWeekIdeas": "idea 1; idea 2",
  "menuMd": "[exact full content of FILE 1 — every character]",
  "shoppingListMd": "[exact full content of FILE 2 — every character]",
  "mealsIngredients": [exact JSON object from FILE 6 — embed as JSON not a string]
}
<!--WEEK_IMPORT_END-->
\`\`\`

Rules for FILE 7: weekDate = Monday in YYYY-MM-DD; meals exactly match FILE 3; menuMd/shoppingListMd = complete raw text with newlines escaped as \\n; mealsIngredients = full JSON object from FILE 6 embedded as JSON; mealHistoryEntry = full FILE 4 text with newlines escaped. The block must be valid JSON — do NOT truncate any field.`;

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

// ── POST /api/import-week — save a full AI-generated week to the database ─────
app.post('/api/import-week', async (req, res) => {
  try {
    const {
      weekDate, weekLabel, shoppingDate,
      meals, mealHistoryEntry, followingWeekIdeas,
      menuMd, shoppingListMd, mealsIngredients,
    } = req.body;

    // Validate required fields
    if (!weekDate || !/^\d{4}-\d{2}-\d{2}$/.test(weekDate)) {
      return res.status(400).json({ error: 'invalid_week_date', detail: 'weekDate must be YYYY-MM-DD' });
    }
    if (!menuMd || typeof menuMd !== 'string' || menuMd.trim().length < 10) {
      return res.status(400).json({ error: 'menu_md_required' });
    }
    if (!shoppingListMd || typeof shoppingListMd !== 'string' || shoppingListMd.trim().length < 10) {
      return res.status(400).json({ error: 'shopping_list_md_required' });
    }
    if (!Array.isArray(meals) || !meals.length) {
      return res.status(400).json({ error: 'meals_array_required' });
    }

    const effectiveShoppingDate = (shoppingDate && /^\d{4}-\d{2}-\d{2}$/.test(shoppingDate))
      ? shoppingDate : weekDate;
    const effectiveLabel = (weekLabel && typeof weekLabel === 'string')
      ? weekLabel.trim() : `Week of ${weekDate}`;

    // 1. Upsert weekly_menus
    await pool.query(
      `INSERT INTO weekly_menus (week_date, label, content_md, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (week_date)
       DO UPDATE SET label = EXCLUDED.label, content_md = EXCLUDED.content_md, updated_at = NOW()`,
      [weekDate, effectiveLabel, menuMd.trim()],
    );

    // 2. Upsert shopping_lists
    await pool.query(
      `INSERT INTO shopping_lists (week_date, content_md, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (week_date)
       DO UPDATE SET content_md = EXCLUDED.content_md, updated_at = NOW()`,
      [weekDate, shoppingListMd.trim()],
    );

    // 3. Update manifest (preserve all existing top-level keys, overwrite currentWeek block)
    const { rows: manifestRows } = await pool.query('SELECT data FROM manifest WHERE id = 1');
    const existingManifest = manifestRows[0]?.data || {};
    const updatedManifest = {
      ...existingManifest,
      currentWeek:  weekDate,
      weekLabel:    effectiveLabel,
      shoppingDate: effectiveShoppingDate,
      files: {
        menu:         `menus/${weekDate}-menu.md`,
        shoppingList: `shopping-lists/${weekDate}-shopping-list.md`,
      },
      meals,
    };
    await pool.query(
      `INSERT INTO manifest (id, data, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id)
       DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [JSON.stringify(updatedManifest)],
    );

    // 4. Prepend mealHistoryEntry to meal-history document
    if (mealHistoryEntry && typeof mealHistoryEntry === 'string' && mealHistoryEntry.trim()) {
      const { rows: histRows } = await pool.query(
        "SELECT content FROM documents WHERE key = 'meal-history'",
      );
      const existing = histRows[0]?.content || '';
      const updated  = mealHistoryEntry.trim() + '\n\n' + existing;
      await pool.query(
        `INSERT INTO documents (key, content, updated_at)
         VALUES ('meal-history', $1, NOW())
         ON CONFLICT (key)
         DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
        [updated],
      );
    }

    // 5. Replace meals-ingredients document
    if (mealsIngredients && typeof mealsIngredients === 'object') {
      await pool.query(
        `INSERT INTO documents (key, content, updated_at)
         VALUES ('meals-ingredients', $1, NOW())
         ON CONFLICT (key)
         DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
        [JSON.stringify(mealsIngredients)],
      );
    }

    // 6. Clear include_in_prompt flag on all meal ideas (they've been used)
    await pool.query('UPDATE meal_ideas SET include_in_prompt = false WHERE include_in_prompt = true');

    res.json({ ok: true, weekDate, weekLabel: effectiveLabel });
  } catch (err) {
    console.error('POST /api/import-week:', err.message);
    res.status(500).json({ error: 'db_error', detail: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

// ── Pantry Recipes API ────────────────────────────────────────────────────────

// GET /api/pantry-recipes — list all pantry recipes
app.get('/api/pantry-recipes', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM pantry_recipes ORDER BY category, name',
    );
    res.json({ recipes: rows });
  } catch (err) {
    console.error('GET /api/pantry-recipes:', err.message);
    res.status(500).json({ error: 'db_error' });
  }
});

// POST /api/pantry-recipes — create a new pantry recipe
app.post('/api/pantry-recipes', async (req, res) => {
  try {
    const { name, category, yield_desc, keeps_desc, recipe_md, ingredients, notes, source_url } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });
    const { rows } = await pool.query(
      `INSERT INTO pantry_recipes (name, category, yield_desc, keeps_desc, recipe_md, ingredients, notes, source_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name.trim(), category || null, yield_desc || null, keeps_desc || null,
       recipe_md || null, JSON.stringify(ingredients || []), notes || null, source_url || null],
    );
    res.status(201).json({ recipe: rows[0] });
  } catch (err) {
    console.error('POST /api/pantry-recipes:', err.message);
    res.status(500).json({ error: 'db_error' });
  }
});

// PATCH /api/pantry-recipes/:id — update fields or mark last made
app.patch('/api/pantry-recipes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (req.body.mark_made) {
      const today = new Date().toISOString().slice(0, 10);
      const { rows } = await pool.query(
        'UPDATE pantry_recipes SET last_made = $1 WHERE id = $2 RETURNING *', [today, id],
      );
      return res.json({ recipe: rows[0] });
    }
    const allowed = ['name', 'category', 'yield_desc', 'keeps_desc', 'recipe_md', 'ingredients', 'notes', 'source_url', 'last_made'];
    const fields = [], vals = [];
    for (const [k, v] of Object.entries(req.body)) {
      if (allowed.includes(k)) {
        fields.push(`${k} = $${fields.length + 1}`);
        vals.push(k === 'ingredients' ? JSON.stringify(v) : v);
      }
    }
    if (!fields.length) return res.status(400).json({ error: 'no valid fields' });
    vals.push(id);
    const { rows } = await pool.query(
      `UPDATE pantry_recipes SET ${fields.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals,
    );
    res.json({ recipe: rows[0] });
  } catch (err) {
    console.error('PATCH /api/pantry-recipes/:id:', err.message);
    res.status(500).json({ error: 'db_error' });
  }
});

// DELETE /api/pantry-recipes/:id
app.delete('/api/pantry-recipes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM pantry_recipes WHERE id = $1', [parseInt(req.params.id, 10)]);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/pantry-recipes/:id:', err.message);
    res.status(500).json({ error: 'db_error' });
  }
});

// ── Special Events API ────────────────────────────────────────────────────────

function evSlug(name, date) {
  return date + '-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// GET /api/special-events — list all events
app.get('/api/special-events', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM special_events ORDER BY date DESC',
    );
    res.json({ events: rows });
  } catch (err) {
    console.error('GET /api/special-events:', err.message);
    res.status(500).json({ error: 'db_error' });
  }
});

// GET /api/special-events/:id
app.get('/api/special-events/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await pool.query('SELECT * FROM special_events WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json({ event: rows[0] });
  } catch (err) {
    console.error('GET /api/special-events/:id:', err.message);
    res.status(500).json({ error: 'db_error' });
  }
});

// POST /api/special-events — create a new event
app.post('/api/special-events', async (req, res) => {
  try {
    const { name, date, week, budget, shopping_list_md, recipes_md, prep_md, packing_list_md, notes } = req.body;
    if (!name?.trim() || !date?.trim()) {
      return res.status(400).json({ error: 'name and date are required' });
    }
    const slug = evSlug(name.trim(), date.trim());
    const { rows } = await pool.query(
      `INSERT INTO special_events (name, date, slug, week, budget, shopping_list_md, recipes_md, prep_md, packing_list_md, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [name.trim(), date.trim(), slug,
       week || null,
       parseFloat(budget) || 0,
       shopping_list_md || null, recipes_md || null, prep_md || null, packing_list_md || null, notes || null],
    );
    res.status(201).json({ event: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'slug_conflict', detail: 'An event with this name and date already exists.' });
    console.error('POST /api/special-events:', err.message);
    res.status(500).json({ error: 'db_error' });
  }
});

// PATCH /api/special-events/:id — update fields OR log a receipt
// Receipt mode: { store, receipt_amount }
// Update mode: any of { name, date, week, budget, shopping_list_md, recipes_md, prep_md, notes }
app.patch('/api/special-events/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows: existing } = await pool.query('SELECT * FROM special_events WHERE id = $1', [id]);
    if (!existing[0]) return res.status(404).json({ error: 'not_found' });
    const ev = existing[0];

    if (req.body.store != null && req.body.receipt_amount != null) {
      // ── Receipt mode ─────────────────────────────────────────────────────────
      const store  = normalizeStore(String(req.body.store).slice(0, 150));
      const amount = parseFloat(req.body.receipt_amount);
      if (!store || isNaN(amount) || amount < 0) {
        return res.status(400).json({ error: 'invalid_params' });
      }
      const by_store = normByStore(ev.by_store || {});
      by_store[store] = parseFloat(amount.toFixed(2));
      const total_spent = parseFloat(
        Object.values(by_store).reduce((s, v) => s + v, 0).toFixed(2),
      );
      const { rows } = await pool.query(
        `UPDATE special_events SET by_store=$1, total_spent=$2 WHERE id=$3 RETURNING *`,
        [JSON.stringify(by_store), total_spent, id],
      );
      return res.json({ event: rows[0] });
    }

    // ── Field update mode ───────────────────────────────────────────────────
    const allowed = ['name','date','week','budget','shopping_list_md','recipes_md','prep_md','packing_list_md','notes'];
    const fields = [], vals = [];
    for (const [k, v] of Object.entries(req.body)) {
      if (allowed.includes(k)) { fields.push(`${k} = $${fields.length + 1}`); vals.push(v); }
    }
    if (!fields.length) return res.status(400).json({ error: 'no_valid_fields' });
    vals.push(id);
    const { rows } = await pool.query(
      `UPDATE special_events SET ${fields.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals,
    );
    res.json({ event: rows[0] });
  } catch (err) {
    console.error('PATCH /api/special-events/:id:', err.message);
    res.status(500).json({ error: 'db_error' });
  }
});

// DELETE /api/special-events/:id
app.delete('/api/special-events/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rowCount } = await pool.query('DELETE FROM special_events WHERE id = $1', [id]);
    res.json({ ok: true, deleted: rowCount });
  } catch (err) {
    console.error('DELETE /api/special-events/:id:', err.message);
    res.status(500).json({ error: 'db_error' });
  }
});

// ── Seed Kamayan Feast on first run ───────────────────────────────────────────
const KAMAYAN_SHOPPING_LIST = `# Kamayan Feast — Shopping List (Serves 6)

> **Notes:** Most items available at any supermarket. Kecap manis, bagoong, bihon noodles, white cane vinegar, kangkung, calamansi, green mangoes, banana leaves, and palm sugar → Asian grocery (H Mart, 99 Ranch, Seafood City). Pick up rotisserie chickens and ice the day of the feast.

---

🥬 **PRODUCE & FRESH**

> Most at any supermarket. Kangkung and calamansi at Asian grocery.

- 2 whole Rotisserie chickens — pick up day-of
- 800g (1.75 lbs) Beef sirloin or flank steak — sliced thin; Beef Tapa
- 800g (1.75 lbs) Chicken thighs — boneless; Chicken Satay
- 3 Green (unripe) mangoes — Ensaladang Mangga *(sub: Granny Smith apple)*
- 3–4 Ripe Philippine mangoes — Ataulfo/champagne are closest
- 1 whole Seedless watermelon — fresh slices + Rujak
- 1 small Pineapple — Rujak
- 3 large Cucumbers — Ensaladang Pipino + Rujak
- 1 Jicama — Rujak (optional) *(sub: water chestnut or Asian pear)*
- 2 bunches Kangkung (water spinach) — Adobong Kangkung *(sub: baby spinach)*
- 2 bags Baby spinach — mix with kangkung or use solo
- 1 small head Cabbage — Pancit Bihon
- 2 Carrots — Pancit Bihon
- 1 cup Green beans — Pancit Bihon
- 2 cups Bean sprouts — Pancit Bihon
- 2 stalks Celery — Pancit Bihon
- 3 Tomatoes — Ensaladang Mangga + Pipino
- 2 heads Garlic — you'll use a lot!
- 3 Red onions — Ensaladang Mangga + Pipino
- 2 Yellow onions — Pancit Bihon
- 1 bunch Green onions / scallions — Sinangag garnish
- 1 bunch Fresh cilantro — optional garnish
- 1 bunch Fresh red chilies or bird's eye chilies
- 4–5 stalks Lemongrass — satay marinade + ginger drink
- 1 large piece Fresh ginger — ginger drink + marinades
- 20–30 Calamansi — for squeezing over everything *(sub: 4–5 limes)*

---

🛒 **PANTRY & DRY GOODS**

> Kecap manis, bagoong, bihon noodles, cane vinegar at Asian grocery. Everything else at supermarket.

- 4 cups Jasmine or long-grain white rice — Sinangag (cook day before)
- 400g (14oz) Bihon rice vermicelli noodles — Pancit Bihon *(sub: glass noodles or thin rice noodles)*
- 1 bottle Soy sauce — regular, not low-sodium
- 1 bottle Kecap manis — Indonesian sweet soy sauce *(sub: 2 tbsp soy + 1 tbsp brown sugar per 3 tbsp)*
- 1 jar Sambal oelek — Huy Fong brand (red rooster) recommended
- 1 jar Bagoong — Filipino shrimp paste *(sub: fish sauce)*
- 1 bottle White cane vinegar — adobo and sawsawan *(sub: white wine vinegar)*
- 1 jar/block Tamarind paste or concentrate — Rujak dressing *(sub: lime juice + Worcestershire sauce)*
- 1 jar Oyster sauce — Pancit and Kangkung (use vegetarian version if needed)
- 1 cup Smooth peanut butter — peanut sauce
- 2 cans Coconut milk (14oz each) — peanut sauce
- 1 bag Palm sugar or brown sugar — Rujak, tapa marinade, drinks
- 1 bag White sugar — iced tea, Pipino dressing
- 1 small jar Ground turmeric — satay marinade
- 1 small jar Ground coriander — satay marinade
- 1 bottle Neutral vegetable oil — frying and grilling
- 1 bottle Sesame oil — optional, for kangkung

---

☕ **BEVERAGES**

- 1 box Black tea bags or loose leaf — iced tea
- Ice — large bag or make your own
- Lemon or calamansi — iced tea garnish

---

🌿 **SPECIALTY ITEMS**

> Filipino or Indonesian grocery store recommended.

- 1 pack Banana leaves — table presentation, often in freezer section *(sub: large ti leaves or foil)*

---

🛍 **NON-FOOD ITEMS**

- 1 pack Bamboo skewers — soak in water 30 min before grilling
- Small bowls or ramekins — for sauces and condiments
- Paper towels or hand towels — for hand washing (it's kamayan!)

---

## Shopping by Store

### Regular Supermarket (Whole Foods, Stop & Shop, etc.)
- Chicken, beef, produce (except kangkung/calamansi), coconut milk, peanut butter, soy sauce, sambal oelek, tamarind, oyster sauce, bamboo skewers, tea, sugar, oil

### Asian Grocery (H Mart, 99 Ranch, Seafood City, etc.)
- Kecap manis, bagoong, bihon noodles, white cane vinegar, kangkung, calamansi, green mangoes, banana leaves, palm sugar, lemongrass

### Pick Up Day-Of
- 2 rotisserie chickens
- Ice`;

const KAMAYAN_RECIPES = `# Kamayan Feast — Recipes (Serves 6)

*Inspired by Yasmin Newman's 7000 Islands & Pat Tanumihardja's The Asian Grandmothers Cookbook*

> ✓ **MAKE AHEAD** = Can be fully or partially made ahead of the day
> ↺ **SUB** = Easy ingredient substitutions

---

## 🍚 Rice

### 1. Sinangag — Garlic Fried Rice
*Inspired by Yasmin Newman, 7000 Islands — Rice & Noodles chapter*

> ✓ **MAKE AHEAD:** Cook plain rice the day before. Fry with garlic on the day — takes 10 minutes.

**Ingredients**
- 4 cups day-old cooked white rice
- 8 cloves garlic, minced
- 3 tbsp neutral oil
- Salt to taste
- 2 eggs (optional)
- Green onions to garnish

**Method**
1. Use day-old rice — fresh rice is too wet and will clump.
2. Heat oil in a large wok or wide pan over high heat. Fry garlic until golden, about 2 minutes.
3. Add rice, breaking up any clumps. Toss and press against the wok for 5–7 minutes until lightly crispy.
4. Season with salt. Push rice to the side, scramble in eggs if using, then fold through.
5. Top with green onions and extra fried garlic to serve.

> ↺ **SUB:** No wok? A wide non-stick skillet on the highest heat you have works fine.

---

## 🍗 Proteins

### 2. Rotisserie Chicken
*Store-bought — no recipe needed!*

Pick up 2 whole rotisserie chickens on the day of the feast. Quarter them before laying on the banana leaf, or pull the meat and pile it. Drizzle with calamansi juice and a little kecap manis for a Filipino-Indonesian finish.

> ✓ **MAKE AHEAD:** Keep warm in a 200°F oven for up to 1 hour before serving.

---

### 3. Chicken Satay with Peanut Sauce
*Inspired by Pat Tanumihardja, The Asian Grandmothers Cookbook — Indonesian recipes section*

> ✓ **MAKE AHEAD:** Marinate chicken overnight. Make peanut sauce up to 3 days ahead. Grill on the day.

**Ingredients** (~24 skewers)
- 800g (1.75 lbs) chicken thighs, cut into 1-inch cubes
- 3 tbsp kecap manis (sweet soy sauce)
- 2 tbsp soy sauce
- 1 tbsp vegetable oil
- 2 tsp ground turmeric
- 2 tsp ground coriander
- 3 cloves garlic, minced
- 1 stalk lemongrass, white part minced
- Bamboo skewers, soaked in water 30 min

**Method**
1. Mix all marinade ingredients. Toss chicken to coat. Marinate minimum 2 hours or overnight in the fridge.
2. Thread 3–4 chicken pieces onto each skewer.
3. Grill over high heat (or under broiler) 3–4 minutes per side until charred and cooked through.
4. Serve with peanut sauce alongside.

*Shortcut: Skip skewering — grill whole marinated thighs and slice to serve. Same flavor, half the work.*

**Peanut Sauce**
- 1 cup smooth peanut butter
- 1 cup coconut milk
- 2 tbsp kecap manis
- 1 tbsp soy sauce
- 1 tbsp lime juice
- 2 tsp sambal oelek
- 2 cloves garlic, minced
- Water to thin as needed

1. Combine all ingredients in a small saucepan over medium-low heat.
2. Stir until smooth and warmed through, about 5 minutes.
3. Add water a tablespoon at a time until it coats a spoon easily.
4. Taste and adjust: more lime for tang, more kecap manis for sweetness, more sambal for heat.

> ↺ **SUB:** No kecap manis? Mix 2 tbsp soy sauce + 1 tbsp brown sugar as a substitute.
> ↺ **SUB:** Nut allergy? Sunflower seed butter works in the peanut sauce.

---

### 4. Beef Tapa
*Inspired by Yasmin Newman, 7000 Islands — Everyday Food chapter*

> ✓ **MAKE AHEAD:** Marinate overnight. Cook on the day — takes only 10 minutes.

**Ingredients**
- 800g (1.75 lbs) beef sirloin or flank steak, sliced very thin
- 4 tbsp soy sauce
- 2 tbsp sugar (white or brown)
- 1 tbsp calamansi juice or lime juice
- 4 cloves garlic, minced
- 1 tsp black pepper
- Oil for frying

**Method**
1. Combine soy sauce, sugar, calamansi, garlic, and pepper. Toss with sliced beef until fully coated.
2. Marinate in the fridge at least 2 hours, ideally overnight.
3. Heat a little oil in a pan over high heat. Fry beef in batches — don't crowd the pan.
4. Cook 2–3 minutes per side until caramelized at the edges.
5. Fan out on the banana leaf to serve.

> ↺ **SUB:** No calamansi? Regular lime juice is a perfect substitute.
> ↺ **SUB:** No sirloin? Ribeye works beautifully and stays tender.

---

## 🥬 Vegetables & Noodles

### 5. Vegetarian Pancit Bihon
*Inspired by Pat Tanumihardja and Yasmin Newman*

> ✓ **MAKE AHEAD:** Make up to 4 hours ahead. Cover and keep at room temperature. Reheat in a wok with a splash of water if needed.

**Ingredients**
- 400g (14oz) bihon rice vermicelli noodles
- 2 cups cabbage, shredded
- 2 carrots, julienned
- 1 cup green beans, halved
- 1 cup bean sprouts
- 1 cup celery, sliced
- 6 cloves garlic, minced
- 1 onion, sliced
- 4 tbsp soy sauce
- 2 tbsp oyster sauce (or vegetarian oyster sauce)
- 1 cup vegetable broth
- Oil for cooking
- Calamansi or lime to serve

**Method**
1. Soak noodles in cold water 10 minutes until pliable. Drain and set aside.
2. Heat oil in a large wok over high heat. Sauté garlic and onion until soft.
3. Add carrots, green beans, and celery first. Stir-fry 3 minutes.
4. Add cabbage and bean sprouts. Toss.
5. Add noodles, soy sauce, oyster sauce, and broth. Toss everything over high heat until noodles absorb the liquid, about 5 minutes.
6. Taste and adjust seasoning. Serve with calamansi halves for squeezing.

> ↺ **SUB:** No bihon? Glass noodles or thin rice noodles are good substitutes.

---

### 6. Adobong Kangkung with Spinach
*Inspired by Yasmin Newman, 7000 Islands — Vegetables & Salads chapter*

> ✓ **MAKE AHEAD:** Prep garlic and mix the sauce a day ahead. Cook the greens just before serving — 10 minutes.

**Ingredients**
- 2 large bunches kangkung (water spinach) OR all baby spinach
- 2 cups baby spinach
- 6 cloves garlic, minced
- 3 tbsp soy sauce
- 2 tbsp white vinegar
- 1 tbsp oyster sauce
- 1 tsp black pepper
- 2 tbsp oil
- Optional: 1 red chili, sliced

**Method**
1. Wash and trim kangkung into 3-inch pieces. If using kale instead, blanch 1 minute first.
2. Heat oil in a wok over high heat. Add garlic (and chili if using). Stir-fry 30 seconds.
3. Add kangkung stems first, then leaves and spinach. Toss quickly.
4. Pour in soy sauce, vinegar, and oyster sauce. Toss 2–3 minutes until wilted but still bright green.
5. Season with pepper. Serve immediately.

> ↺ **SUB:** Can't find kangkung? Use all baby spinach, or spinach and kale combined.
> ↺ **SUB:** Vegetarian? Skip oyster sauce and add a dash of sesame oil instead.

---

## 🥗 Salads

### 7. Ensaladang Pipino — Cucumber Salad
*Inspired by Yasmin Newman, 7000 Islands — Vegetables & Salads chapter*

> ✓ **MAKE AHEAD:** Make up to 4 hours ahead. Gets better as it sits in the fridge.

**Ingredients**
- 3 large cucumbers, thinly sliced
- 1 small red onion, thinly sliced
- 3 tbsp white cane vinegar or white wine vinegar
- 1 tbsp sugar
- 1 tsp salt
- Optional: 2 tomatoes, sliced
- Optional: handful of fresh cilantro

**Method**
1. Combine vinegar, sugar, and salt. Stir until dissolved.
2. Toss cucumbers and onion in the dressing.
3. Chill at least 30 minutes. Add tomatoes and cilantro just before serving.

> ↺ **SUB:** No cane vinegar? White wine vinegar or rice vinegar both work well.

---

### 8. Ensaladang Mangga — Green Mango Salad
*Inspired by Yasmin Newman, 7000 Islands — Vegetables & Salads chapter*

> ✓ **MAKE AHEAD:** Prep mango and tomato a day ahead. Add bagoong dressing just before serving.

**Ingredients**
- 3 green (unripe) mangoes, peeled and julienned or coarsely grated
- 2 tomatoes, chopped
- 1 small red onion, thinly sliced
- 2–3 tbsp bagoong (shrimp paste)
- Juice of 2 calamansi or 1 lime
- Optional: 1 red chili, sliced

**Method**
1. Combine mango, tomato, and onion in a bowl.
2. Mix bagoong with calamansi juice. Toss through the salad.
3. Taste — it should be sharp, salty, and a little funky. Adjust with more lime or bagoong.
4. Garnish with chili if using. Serve chilled.

> ↺ **SUB:** Can't find green mango? Granny Smith apple + extra lime is a great substitute.
> ↺ **SUB:** No bagoong? Use 1 tbsp fish sauce, or omit for a vegetarian version.

---

## 🍉 Fruit

### 9. Rujak — Indonesian Spiced Fruit Salad
*Inspired by Pat Tanumihardja, The Asian Grandmothers Cookbook — Indonesian section*

> ✓ **MAKE AHEAD:** Make dressing up to 3 days ahead. Cut fruit day-of. Dress just before serving.

**Ingredients**
- 1 green mango, peeled and sliced
- 1 small pineapple, cubed
- 1 cucumber, sliced
- 1 cup watermelon, cubed
- Optional: jicama, papaya, or starfruit
- **DRESSING:** 2 tbsp tamarind paste, 2 tbsp palm sugar or brown sugar, 1–2 tsp sambal oelek, 1 tbsp lime juice, pinch of salt

**Method**
1. Mix tamarind, sugar, sambal, lime, and salt. Stir until sugar dissolves — should be sweet, sour, spicy, and a little salty.
2. Arrange all fruit on a plate or in a bowl.
3. Drizzle dressing over just before serving, or serve on the side.

> ↺ **SUB:** No tamarind paste? Use 1 tbsp lime juice + 1 tbsp Worcestershire sauce.
> ↺ **SUB:** No palm sugar? Brown sugar works perfectly.

---

### 10. Watermelon Slices & Fresh Mango

Slice a whole seedless watermelon into thick wedges. Slice 3–4 ripe Philippine mangoes. Arrange around the edges of the banana leaf — the red and green are beautiful. Optional: a tiny pinch of chili flakes or tajin on the watermelon.

> ✓ **MAKE AHEAD:** Slice up to 4 hours ahead and refrigerate.

---

## 🫙 Sauces & Condiments

*Yasmin Newman devotes an entire chapter to sawsawan (dipping sauces) in 7000 Islands.*

Place all sauces in small bowls directly on or alongside the banana leaf:

- **Peanut sauce** — recipe above, already made for the satay
- **Sambal oelek** — store-bought is perfect. Look for Huy Fong brand (red rooster jar)
- **Kecap manis** — Indonesian sweet soy. Available at most Asian grocery stores
- **Spiced Filipino vinegar** — heat ½ cup white cane vinegar with 2 sliced garlic cloves, 1 bird's eye chili, pinch of salt. Serve warm or at room temperature
- **Calamansi halves** — for squeezing over everything. Substitute with lime
- **Bagoong** — Filipino shrimp paste, served alongside the ensaladang mangga

---

## ☕ Drinks

### Sweet Iced Tea
Brew a large batch of black tea (or oolong), sweeten while hot, cool, and refrigerate. Serve over ice with lemon or calamansi slices.

### Ginger & Lemongrass Hot Drink
Simmer 3–4 inches of sliced fresh ginger and 3 bruised lemongrass stalks in 6 cups of water for 20–25 minutes. Sweeten with sugar to taste. Strain and serve hot. Fragrant and soothing — especially wonderful with the rich satay and tapa.

> ✓ **MAKE AHEAD:** Make both drinks the day before and refrigerate. Reheat the ginger drink on the day.

---

*Kain na tayo! — Let's eat! May your table be full, your hands busy, and your family together.*`;

const KAMAYAN_PREP = `## 2 Days Before
- [ ] Make peanut sauce — refrigerate
- [ ] Make rujak dressing — refrigerate
- [ ] Make ginger lemongrass drink — refrigerate
- [ ] Brew and sweeten iced tea — refrigerate

## 1 Day Before
- [ ] Marinate beef tapa overnight
- [ ] Marinate chicken satay overnight
- [ ] Cook rice for sinangag (must be cold for frying)
- [ ] Prep ensaladang pipino — refrigerate
- [ ] Julienne mango and tomato for ensaladang mangga — refrigerate

## Day of Feast
- [ ] Morning: Cut all fruit (rujak, watermelon, mango slices) — refrigerate
- [ ] Morning: Prep all vegetable ingredients for pancit and kangkung
- [ ] 2 hrs before: Pick up rotisserie chickens — keep warm at 200°F
- [ ] 1 hr before: Cook pancit bihon
- [ ] 45 min before: Grill chicken satay
- [ ] 30 min before: Cook beef tapa
- [ ] 20 min before: Make sinangag
- [ ] 15 min before: Dress ensaladang mangga and rujak
- [ ] 10 min before: Make adobong kangkung — serve immediately
- [ ] Just before: Lay banana leaves, arrange everything, scatter calamansi & sauces
- [ ] Reheat ginger lemongrass drink on the stove — fill iced tea glasses`;

async function seedKamayanFeast() {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) AS n FROM special_events');
    if (parseInt(rows[0].n, 10) > 0) return; // already seeded
    await pool.query(
      `INSERT INTO special_events (name, date, slug, week, budget, shopping_list_md, recipes_md, prep_md, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (slug) DO NOTHING`,
      [
        'Kamayan Feast',
        '2026-05-16',
        '2026-05-16-kamayan-feast',
        '2026-05-11',
        200,
        KAMAYAN_SHOPPING_LIST,
        KAMAYAN_RECIPES,
        KAMAYAN_PREP,
        'Filipino & Indonesian feast for 6. Inspired by Yasmin Newman\'s 7000 Islands & Pat Tanumihardja\'s The Asian Grandmothers Cookbook. Kamayan = eating with your hands from banana leaves.',
      ],
    );
    console.log('🎉 Kamayan Feast seeded.');
  } catch (err) {
    console.error('Kamayan seed error:', err.message);
  }
}

// ── POST /api/move-menu-week — reassign a menu to a different week date ────────
app.post('/api/move-menu-week', async (req, res) => {
  try {
    const fromDate = String(req.body.fromDate || '').trim();
    const toDate   = String(req.body.toDate   || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) return res.status(400).json({ error: 'invalid_from_date' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(toDate))   return res.status(400).json({ error: 'invalid_to_date' });
    if (fromDate === toDate)                     return res.status(400).json({ error: 'dates_identical' });

    const { rows: srcRows } = await pool.query(
      'SELECT label, content_md FROM weekly_menus WHERE week_date = $1', [fromDate],
    );
    if (!srcRows[0]) return res.status(404).json({ error: 'source_week_not_found', detail: `No menu found for ${fromDate}` });

    const { rows: tgtRows } = await pool.query(
      'SELECT 1 FROM weekly_menus WHERE week_date = $1', [toDate],
    );
    if (tgtRows[0]) return res.status(409).json({ error: 'target_week_exists', detail: `A menu already exists for ${toDate}. Delete it first or choose a different date.` });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Move weekly_menus (PK = week_date)
      await client.query(
        'INSERT INTO weekly_menus (week_date, label, content_md, updated_at) VALUES ($1, $2, $3, NOW())',
        [toDate, srcRows[0].label, srcRows[0].content_md],
      );
      await client.query('DELETE FROM weekly_menus WHERE week_date = $1', [fromDate]);

      // Move shopping_lists (if exists)
      const { rows: listRow } = await client.query(
        'SELECT content_md FROM shopping_lists WHERE week_date = $1', [fromDate],
      );
      if (listRow[0]) {
        await client.query(
          'INSERT INTO shopping_lists (week_date, content_md, updated_at) VALUES ($1, $2, NOW())',
          [toDate, listRow[0].content_md],
        );
        await client.query('DELETE FROM shopping_lists WHERE week_date = $1', [fromDate]);
      }

      // Move cart_state (if exists)
      const { rows: cartRow } = await client.query(
        'SELECT state FROM cart_state WHERE week_key = $1', [fromDate],
      );
      if (cartRow[0]) {
        await client.query(
          `INSERT INTO cart_state (week_key, state, updated_at) VALUES ($1, $2, NOW())
           ON CONFLICT (week_key) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`,
          [toDate, JSON.stringify(cartRow[0].state)],
        );
        await client.query('DELETE FROM cart_state WHERE week_key = $1', [fromDate]);
      }

      // Update shopping_audits week_date references
      await client.query(
        'UPDATE shopping_audits SET week_date = $1 WHERE week_date = $2', [toDate, fromDate],
      );

      // Update manifest if it references fromDate
      const { rows: manifestRows } = await client.query('SELECT data FROM manifest WHERE id = 1');
      if (manifestRows[0]) {
        let manifest = manifestRows[0].data;
        let changed  = false;
        if (manifest.currentWeek === fromDate) {
          manifest = {
            ...manifest,
            currentWeek: toDate,
            files: {
              menu:         `menus/${toDate}-menu.md`,
              shoppingList: `shopping-lists/${toDate}-shopping-list.md`,
            },
          };
          changed = true;
        }
        if (manifest.lastWeek && manifest.lastWeek.currentWeek === fromDate) {
          manifest = {
            ...manifest,
            lastWeek: {
              ...manifest.lastWeek,
              currentWeek: toDate,
              files: {
                menu:         `menus/${toDate}-menu.md`,
                shoppingList: `shopping-lists/${toDate}-shopping-list.md`,
              },
            },
          };
          changed = true;
        }
        if (changed) {
          await client.query(
            'UPDATE manifest SET data = $1, updated_at = NOW() WHERE id = 1',
            [JSON.stringify(manifest)],
          );
        }
      }

      await client.query('COMMIT');
      res.json({ ok: true, fromDate, toDate });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('POST /api/move-menu-week:', err.message);
    res.status(500).json({ error: 'db_error', detail: err.message });
  }
});

// ── POST /api/swap-meal-days — swap two meals between day slots ────────────────
app.post('/api/swap-meal-days', async (req, res) => {
  try {
    const weekDate = String(req.body.weekDate || '').trim();
    const dayA     = String(req.body.dayA || '').trim(); // e.g. "Monday"
    const dayB     = String(req.body.dayB || '').trim(); // e.g. "Friday"

    if (!weekDate || !/^\d{4}-\d{2}-\d{2}$/.test(weekDate)) {
      return res.status(400).json({ error: 'invalid_week_date' });
    }
    if (!dayA || !dayB || dayA.toLowerCase() === dayB.toLowerCase()) {
      return res.status(400).json({ error: 'invalid_days' });
    }

    const { rows: manifestRows } = await pool.query('SELECT data FROM manifest WHERE id = 1');
    if (!manifestRows[0]) return res.status(404).json({ error: 'no_manifest' });
    const manifest = manifestRows[0].data;

    if (manifest.currentWeek !== weekDate) {
      return res.status(400).json({ error: 'week_not_current', detail: 'Can only swap days in the current week.' });
    }

    const meals = [...(manifest.meals || [])];

    // Find meals by day name prefix (e.g. "Monday" matches "Monday, May 11")
    const idxA = meals.findIndex(m => m.day.toLowerCase().startsWith(dayA.toLowerCase()));
    const idxB = meals.findIndex(m => m.day.toLowerCase().startsWith(dayB.toLowerCase()));
    if (idxA === -1) return res.status(404).json({ error: 'day_not_found', detail: `No meal for "${dayA}"` });
    if (idxB === -1) return res.status(404).json({ error: 'day_not_found', detail: `No meal for "${dayB}"` });

    // Record original full day strings ("Monday, May 11", "Friday, May 15")
    const dayStringA = meals[idxA].day;
    const dayStringB = meals[idxB].day;

    // Swap meal details but keep the day strings pinned to their calendar positions
    const { day: _dA, ...fieldsA } = meals[idxA];
    const { day: _dB, ...fieldsB } = meals[idxB];
    meals[idxA] = { day: dayStringA, ...fieldsB };
    meals[idxB] = { day: dayStringB, ...fieldsA };

    await pool.query(
      'UPDATE manifest SET data = $1, updated_at = NOW() WHERE id = 1',
      [JSON.stringify({ ...manifest, meals })],
    );

    // Update weekly_menus markdown — swap day/date labels in menu text
    const { rows: menuRows } = await pool.query(
      'SELECT content_md FROM weekly_menus WHERE week_date = $1', [weekDate],
    );
    if (menuRows[0]) {
      let md = menuRows[0].content_md;
      const PLACEHOLDER = '\x00SWAPTMP\x00';
      const dayAbbr = { monday:'MON', tuesday:'TUE', wednesday:'WED', thursday:'THU', friday:'FRI', saturday:'SAT', sunday:'SUN' };
      const abbrA   = dayAbbr[dayA.toLowerCase()] || dayA.slice(0, 3).toUpperCase();
      const abbrB   = dayAbbr[dayB.toLowerCase()] || dayB.slice(0, 3).toUpperCase();
      const datePartA = dayStringA.includes(', ') ? dayStringA.slice(dayStringA.indexOf(', ') + 2) : '';
      const datePartB = dayStringB.includes(', ') ? dayStringB.slice(dayStringB.indexOf(', ') + 2) : '';
      if (datePartA && datePartB) {
        const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Swap full day strings: "*(Monday, May 11)*" ↔ "*(Friday, May 15)*"
        md = md.replace(new RegExp(escRe(`*(${dayStringA})*`), 'g'), `*(${PLACEHOLDER}A)*`);
        md = md.replace(new RegExp(escRe(`*(${dayStringB})*`), 'g'), `*(${dayStringA})*`);
        md = md.split(`*(${PLACEHOLDER}A)*`).join(`*(${dayStringB})*`);
        // Swap abbreviated quick-glance form: "*(MON, May 11)*" ↔ "*(FRI, May 15)*"
        const abbrPatA = `*(${abbrA}, ${datePartA})*`;
        const abbrPatB = `*(${abbrB}, ${datePartB})*`;
        md = md.split(abbrPatA).join(`(${PLACEHOLDER}B)`);
        md = md.split(abbrPatB).join(abbrPatA);
        md = md.split(`(${PLACEHOLDER}B)`).join(abbrPatB);
      }
      await pool.query(
        'UPDATE weekly_menus SET content_md = $1, updated_at = NOW() WHERE week_date = $2',
        [md, weekDate],
      );
    }

    res.json({ ok: true, meals });
  } catch (err) {
    console.error('POST /api/swap-meal-days:', err.message);
    res.status(500).json({ error: 'db_error', detail: err.message });
  }
});

app.listen(PORT, () =>
  console.log(`🥬 Brooklyn Kitchen running on http://localhost:${PORT}`),
);
