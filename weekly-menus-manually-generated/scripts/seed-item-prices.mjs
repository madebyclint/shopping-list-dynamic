/**
 * One-off script: seed item_prices from this week's cart state price overrides.
 * Run: node scripts/seed-item-prices.mjs
 */
import pg      from 'pg';
import { fileURLToPath } from 'url';
import path    from 'path';
import { readFileSync, existsSync } from 'fs';

// Load .env.local
const envFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

// Prices captured from the May 4 week cart state overrides (indices resolved to names)
const items = [
  { name: 'cherry tomatoes',      price: 7.00 },
  { name: 'avocado',              price: 5.00 },
  { name: 'beef short ribs',      price: 20.00 },
  { name: 'almond milk',          price: 6.49 },
  { name: 'baked beans',          price: 5.00 },
  { name: 'avocado oil',          price: 12.99 },
  { name: 'banana leaves frozen', price: 3.99 },
];

await pool.query(`
  CREATE TABLE IF NOT EXISTS item_prices (
    name       TEXT        PRIMARY KEY,
    price      NUMERIC     NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`);

for (const { name, price } of items) {
  await pool.query(
    `INSERT INTO item_prices (name, price, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (name) DO UPDATE SET price = EXCLUDED.price, updated_at = NOW()`,
    [name, price],
  );
  console.log(`  saved: ${name} => $${price}`);
}

await pool.end();
console.log('Done.');
