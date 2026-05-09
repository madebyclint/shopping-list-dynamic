#!/usr/bin/env node
/**
 * One-shot import: inserts a Claude-generated week into the DB.
 * Run: node weekly-menus-manually-generated/scripts/import-week.mjs
 */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { config } from 'dotenv';
import pg from 'pg';

// Load .env.local from workspace root
config({ path: new URL('../../.env.local', import.meta.url).pathname });

const DB_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!DB_URL) throw new Error('No POSTGRES_URL / DATABASE_URL in environment');

const pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

const FILES_DIR = '/Users/clintbush/Downloads/files';

function read(filename) {
  return readFileSync(path.join(FILES_DIR, filename), 'utf8');
}

const menuMd       = read('2026-05-11-menu.md');
const shoppingMd   = read('2026-05-11-shopping-list.md');
const mealHistory  = read('meal-history.md');
const mealsIng     = read('meals-ingredients.json');
const dataJson     = JSON.parse(read('data.json'));

const WEEK_DATE = '2026-05-11';
const LABEL     = 'Week of May 11, 2026';

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. weekly_menus
    await client.query(
      `INSERT INTO weekly_menus (week_date, label, content_md, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (week_date) DO UPDATE
         SET label = EXCLUDED.label,
             content_md = EXCLUDED.content_md,
             updated_at = NOW()`,
      [WEEK_DATE, LABEL, menuMd]
    );
    console.log('✓ weekly_menus upserted');

    // 2. shopping_lists
    await client.query(
      `INSERT INTO shopping_lists (week_date, content_md, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (week_date) DO UPDATE
         SET content_md = EXCLUDED.content_md,
             updated_at = NOW()`,
      [WEEK_DATE, shoppingMd]
    );
    console.log('✓ shopping_lists upserted');

    // 3. manifest (data.json — current week pointer)
    await client.query(
      `INSERT INTO manifest (id, data, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE
         SET data = EXCLUDED.data,
             updated_at = NOW()`,
      [JSON.stringify(dataJson)]
    );
    console.log('✓ manifest upserted');

    // 4. documents — meal-history
    await client.query(
      `INSERT INTO documents (key, content, updated_at)
       VALUES ('meal-history', $1, NOW())
       ON CONFLICT (key) DO UPDATE
         SET content = EXCLUDED.content,
             updated_at = NOW()`,
      [mealHistory]
    );
    console.log('✓ documents[meal-history] upserted');

    // 5. documents — meals-ingredients
    await client.query(
      `INSERT INTO documents (key, content, updated_at)
       VALUES ('meals-ingredients', $1, NOW())
       ON CONFLICT (key) DO UPDATE
         SET content = EXCLUDED.content,
             updated_at = NOW()`,
      [mealsIng]
    );
    console.log('✓ documents[meals-ingredients] upserted');

    await client.query('COMMIT');
    console.log('\n✅ All done — week 2026-05-11 is live in the DB.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Import failed, rolled back:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
