/**
 * One-shot migration: reads all local files and upserts them into the
 * Railway Postgres database.
 *
 * Run once (locally or in Railway shell) before first deploy:
 *
 *   DATABASE_URL=postgresql://... node scripts/migrate-to-db.mjs
 *
 * Safe to re-run — all inserts use ON CONFLICT DO UPDATE, so nothing
 * is duplicated.  Run again any time you want the DB to mirror your
 * local files (e.g. after editing price-list.md locally).
 */

import pg   from 'pg';
import fs   from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..'); // weekly-menus-manually-generated/

const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

const pool = new pg.Pool({
  connectionString: DB_URL,
  ssl: DB_URL ? { rejectUnauthorized: false } : false,
});

// ── Helpers ───────────────────────────────────────────────────────────────────
async function readText(rel) {
  return fs.readFile(path.join(ROOT, rel), 'utf8');
}
async function readJSON(rel) {
  return JSON.parse(await readText(rel));
}

async function upsertDoc(key, content) {
  await pool.query(
    `INSERT INTO documents (key, content, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
    [key, content],
  );
}

// ── Schema (idempotent — same as server.mjs) ──────────────────────────────────
async function ensureSchema() {
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

// ── Migration steps ───────────────────────────────────────────────────────────
async function migrateManifest() {
  const data = await readJSON('data.json');
  await pool.query(
    `INSERT INTO manifest (id, data, updated_at)
     VALUES (1, $1, NOW())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    [JSON.stringify(data)],
  );
  console.log('  ✓ manifest (data.json)');
}

async function migrateMenus() {
  // Build a label map from menus/index.json
  let labelMap = {};
  try {
    const idx = await readJSON('menus/index.json');
    for (const m of idx.menus || []) labelMap[m.date] = m.label;
  } catch { /* no index.json — labels will be auto-generated */ }

  const files = await fs.readdir(path.join(ROOT, 'menus'));
  for (const file of files.sort()) {
    const m = file.match(/^(\d{4}-\d{2}-\d{2})-menu\.md$/);
    if (!m) continue;
    const weekDate = m[1];
    const content  = await readText(`menus/${file}`);
    const label    = labelMap[weekDate] || `Week of ${weekDate}`;
    await pool.query(
      `INSERT INTO weekly_menus (week_date, label, content_md, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (week_date) DO UPDATE
         SET label = EXCLUDED.label, content_md = EXCLUDED.content_md, updated_at = NOW()`,
      [weekDate, label, content],
    );
    console.log(`  ✓ menu ${weekDate}`);
  }
}

async function migrateShoppingLists() {
  const files = await fs.readdir(path.join(ROOT, 'shopping-lists'));
  for (const file of files.sort()) {
    const m = file.match(/^(\d{4}-\d{2}-\d{2})-shopping-list\.md$/);
    if (!m) continue;
    const weekDate = m[1];
    const content  = await readText(`shopping-lists/${file}`);
    await pool.query(
      `INSERT INTO shopping_lists (week_date, content_md, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (week_date) DO UPDATE
         SET content_md = EXCLUDED.content_md, updated_at = NOW()`,
      [weekDate, content],
    );
    console.log(`  ✓ shopping list ${weekDate}`);
  }
}

async function migrateAudits() {
  const files = await fs.readdir(path.join(ROOT, 'shopping-audits'));
  for (const file of files.sort()) {
    const m = file.match(/^(\d{4}-\d{2}-\d{2})-audit\.json$/);
    if (!m) continue;
    const shoppingDate = m[1];
    const data         = await readJSON(`shopping-audits/${file}`);
    await pool.query(
      `INSERT INTO shopping_audits (shopping_date, week_date, data, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (shopping_date) DO UPDATE
         SET week_date = EXCLUDED.week_date, data = EXCLUDED.data, updated_at = NOW()`,
      [shoppingDate, data.week || null, JSON.stringify(data)],
    );
    console.log(`  ✓ audit ${shoppingDate}`);
  }
}

async function migrateDocuments() {
  const docs = [
    { key: 'meal-history',      rel: 'meal-history.md' },
    { key: 'price-list',        rel: 'price-list.md' },
    { key: 'meals-ingredients', rel: 'meals-ingredients.json' },
    { key: 'price-history',     rel: 'shopping-audits/price-history.json' },
  ];
  for (const { key, rel } of docs) {
    try {
      const content = await readText(rel);
      await upsertDoc(key, content);
      console.log(`  ✓ ${rel}`);
    } catch (err) {
      console.warn(`  ⚠ skipped ${rel}: ${err.message}`);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    console.error('ERROR: DATABASE_URL or POSTGRES_URL environment variable is not set.');
    console.error('Usage: node --env-file=../.env.local scripts/migrate-to-db.mjs');
    process.exit(1);
  }

  console.log('🚀 Starting migration to Railway Postgres…\n');

  await ensureSchema();
  console.log('Schema ready.\n');

  console.log('Manifest:');
  await migrateManifest();

  console.log('\nMenus:');
  await migrateMenus();

  console.log('\nShopping lists:');
  await migrateShoppingLists();

  console.log('\nAudit data:');
  await migrateAudits();

  console.log('\nDocuments:');
  await migrateDocuments();

  console.log('\n✅ Migration complete!\n');
  await pool.end();
}

main().catch(err => {
  console.error('\n❌ Migration failed:', err.message);
  process.exit(1);
});
