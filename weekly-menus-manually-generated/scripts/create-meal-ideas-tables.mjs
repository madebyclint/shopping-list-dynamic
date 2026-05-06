#!/usr/bin/env node
// Run: npm run migrate:ideas  (from weekly-menus-manually-generated/)

import pg from 'pg';

const { Pool } = pg;
const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!DB_URL) {
  console.error('ERROR: DATABASE_URL or POSTGRES_URL environment variable is not set.');
  console.error('Run with:  npm run migrate:ideas  (uses --env-file=../.env.local automatically)');
  process.exit(1);
}

const pool = new Pool({ connectionString: DB_URL });

async function run() {
  const client = await pool.connect();
  try {
    console.log('Creating meal_ideas table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS meal_ideas (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        cuisine_type VARCHAR(100),
        tags VARCHAR(500),
        notes TEXT,
        is_favorite BOOLEAN DEFAULT false,
        usage_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    console.log('Creating next_week_notes table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS next_week_notes (
        id SERIAL PRIMARY KEY,
        content TEXT NOT NULL,
        note_type VARCHAR(50) NOT NULL DEFAULT 'general',
        week_date DATE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    console.log('✓ Tables created (or already existed).');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
