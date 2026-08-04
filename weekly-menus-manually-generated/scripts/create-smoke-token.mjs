#!/usr/bin/env node
// Register a dedicated OAuth client for the smoke test to probe.
//
//   npm run smoke:token
//
// Step 7 of the smoke test asserts this client_id still resolves after a
// deploy. That is the direct regression test for the original bug, where OAuth
// state lived in memory and every redeploy invalidated the credentials Claude
// had stored.
//
// A client_id is not a secret — it is a public identifier, and no token is
// minted here. It is only useful for asserting the row still exists.
//
// Writes one row to oauth_clients with a recognizable name so it is obvious
// what it is if you find it later. Re-running reuses the existing client
// instead of piling up rows.

import { Pool } from 'pg';
import { randomUUID } from 'crypto';

const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!DB_URL) {
  console.error('No DATABASE_URL / POSTGRES_URL. Try: npm run smoke:token');
  process.exit(2);
}

const CLIENT_NAME = 'brooklyn-kitchen-smoke-probe';
const REDIRECT_URI = 'http://localhost:9999/smoke-callback';

const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

try {
  const existing = await pool.query(
    `SELECT client_id FROM oauth_clients WHERE data->>'client_name' = $1 ORDER BY created_at LIMIT 1`,
    [CLIENT_NAME],
  );

  let clientId = existing.rows[0]?.client_id;
  let reused = Boolean(clientId);

  if (!clientId) {
    clientId = randomUUID();
    const client = {
      client_id: clientId,
      client_name: CLIENT_NAME,
      redirect_uris: [REDIRECT_URI],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
    await pool.query(
      `INSERT INTO oauth_clients (client_id, data) VALUES ($1, $2::jsonb)`,
      [clientId, JSON.stringify(client)],
    );
  }

  console.log(`\n${reused ? 'Reusing existing' : 'Registered'} smoke-probe client.\n`);
  console.log('Add this to .env.local, and as a GitHub Actions secret named SMOKE_CLIENT_ID:\n');
  console.log(`SMOKE_CLIENT_ID=${clientId}\n`);
  console.log('Then `npm run smoke:mcp` will run step 7 instead of skipping it.');
  console.log('Do not delete this row — that is what the check reads.\n');
} finally {
  await pool.end();
}
