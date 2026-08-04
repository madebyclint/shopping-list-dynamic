#!/usr/bin/env node
// Block until the deployed server reports the version in package.json.
//
//   node scripts/wait-for-deploy.mjs [baseUrl] [timeoutSeconds]
//
// Railway builds asynchronously, so a smoke test fired immediately after a push
// would test the OLD container and pass while the new one is broken. This waits
// for the version to actually flip before the checks run.

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

const BASE = (process.argv[2] || process.env.SMOKE_BASE_URL
  || 'https://weekly-menus-manually-generated-production.up.railway.app').replace(/\/$/, '');
const TIMEOUT_S = Number(process.argv[3] || process.env.DEPLOY_TIMEOUT_S || 300);
const INTERVAL_MS = 10_000;

console.log(`Waiting for ${BASE} to report v${version} (timeout ${TIMEOUT_S}s)…`);

const deadline = Date.now() + TIMEOUT_S * 1000;
let last = null;

while (Date.now() < deadline) {
  try {
    const res = await fetch(`${BASE}/api/meta`);
    if (res.ok) {
      const meta = await res.json();
      if (meta.version === version) {
        console.log(`✓ live: v${meta.version}, node ${meta.node}, deployed ${meta.deployedAt}`);
        process.exit(0);
      }
      if (meta.version !== last) {
        console.log(`  … still serving v${meta.version}`);
        last = meta.version;
      }
    } else {
      console.log(`  … HTTP ${res.status}`);
    }
  } catch (err) {
    console.log(`  … ${err.message}`);
  }
  await new Promise(r => setTimeout(r, INTERVAL_MS));
}

console.error(`\n✗ ${BASE} never reported v${version} within ${TIMEOUT_S}s.`);
console.error('The deploy may have failed or rolled back — check the Railway logs.');
process.exit(1);
