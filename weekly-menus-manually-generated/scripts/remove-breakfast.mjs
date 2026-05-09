#!/usr/bin/env node
/**
 * Removes the Savory Egg & Veggie Scramble breakfast from the 2026-05-11 week.
 * Targets: manifest (meals array), weekly_menus (content_md), documents[meals-ingredients]
 */
import { config } from 'dotenv';
import pg from 'pg';

config({ path: new URL('../../.env.local', import.meta.url).pathname });

const DB_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!DB_URL) throw new Error('No POSTGRES_URL / DATABASE_URL in environment');

const pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
const WEEK_DATE = '2026-05-11';
const MEAL_NAME = 'Savory Egg & Veggie Scramble with Toast';

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. manifest — remove from meals array
    const { rows: mRows } = await client.query('SELECT data FROM manifest WHERE id = 1');
    const manifest = mRows[0].data;
    manifest.meals = manifest.meals.filter(m => m.name !== MEAL_NAME);
    await client.query(
      'UPDATE manifest SET data = $1, updated_at = NOW() WHERE id = 1',
      [JSON.stringify(manifest)]
    );
    console.log('✓ manifest meals updated');

    // 2. weekly_menus — strip the breakfast bullet and its deep-view section
    const { rows: wRows } = await client.query(
      'SELECT content_md FROM weekly_menus WHERE week_date = $1', [WEEK_DATE]
    );
    let md = wRows[0].content_md;

    // Remove the Quick Glance bullet line
    md = md.replace(/^- 🥚 Savory Egg.*\n/m, '');

    // Remove the deep-view block: starts with "**🥚 Savory Egg..." up to the next "---\n\n**"
    md = md.replace(/\*\*🥚 Savory Egg & Veggie Scramble with Toast\*\*[\s\S]*?(?=---\n\n\*\*|$)---\n/m, '');

    await client.query(
      'UPDATE weekly_menus SET content_md = $1, updated_at = NOW() WHERE week_date = $2',
      [md, WEEK_DATE]
    );
    console.log('✓ weekly_menus content_md updated');

    // 3. documents[meals-ingredients] — remove from meals array
    const { rows: dRows } = await client.query(
      "SELECT content FROM documents WHERE key = 'meals-ingredients'"
    );
    const mealsIng = JSON.parse(dRows[0].content);
    mealsIng.meals = mealsIng.meals.filter(m => m.name !== MEAL_NAME);
    await client.query(
      "UPDATE documents SET content = $1, updated_at = NOW() WHERE key = 'meals-ingredients'",
      [JSON.stringify(mealsIng, null, 2)]
    );
    console.log('✓ documents[meals-ingredients] updated');

    await client.query('COMMIT');
    console.log('\n✅ Breakfast removed from all DB records.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed, rolled back:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
