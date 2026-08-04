#!/usr/bin/env node
// Post-deploy verification for the MCP connector.
//
// Run this against the DEPLOYED url, not localhost. The failure this exists to
// catch was environmental — correct code on a too-old runtime — so a check that
// only ever runs locally cannot see it.
//
//   npm run smoke:mcp                          # production
//   npm run smoke:mcp -- http://localhost:8080  # somewhere else
//
// Token: SMOKE_TOKEN, or the first entry of MCP_ACCESS_TOKENS (label:token).
// Optional: SMOKE_REFRESH_TOKEN, a long-lived refresh token used by step 7 to
// prove OAuth state survived the redeploy. Step 7 is reported as SKIP (not
// PASS) when it is absent.

import { createHash, randomBytes } from 'crypto';

const BASE = (process.argv[2] || process.env.SMOKE_BASE_URL
  || 'https://weekly-menus-manually-generated-production.up.railway.app').replace(/\/$/, '');

const TOKEN = process.env.SMOKE_TOKEN
  || (process.env.MCP_ACCESS_TOKENS || '').split(',')[0]?.trim().replace(/^[^:]*:/, '');

const REDIRECT_URI = 'http://localhost:9999/smoke-callback';
const PROTOCOL_VERSION = '2025-11-25';

let step = 0;
const results = [];

function pass(name, detail) {
  results.push({ name, ok: true });
  console.log(`  ✓ ${++step}. ${name}${detail ? ` — ${detail}` : ''}`);
}
function skip(name, why) {
  results.push({ name, skipped: true });
  console.log(`  ⊘ ${++step}. ${name} — SKIPPED: ${why}`);
}
function fail(name, detail) {
  results.push({ name, ok: false });
  console.error(`  ✗ ${++step}. ${name}`);
  console.error(`\n${detail}\n`);
  console.error(`FAILED against ${BASE}`);
  process.exit(1);
}

// The transport answers with SSE framing (`event: message\ndata: {...}`) unless
// json-only responses are enabled, so accept either shape.
function parseRpc(text) {
  const line = text.split('\n').find(l => l.startsWith('data:'));
  try { return JSON.parse(line ? line.slice(5).trim() : text); } catch { return null; }
}

async function rpc(body, { token, sessionId } = {}) {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    authorization: `Bearer ${token}`,
  };
  if (sessionId) {
    headers['mcp-session-id'] = sessionId;
    headers['mcp-protocol-version'] = PROTOCOL_VERSION;
  }
  const res = await fetch(`${BASE}/mcp`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { res, text: await res.text() };
}

// Completes register → authorize → token and returns the token payload.
async function oauthDance() {
  const verifier = randomBytes(32).toString('hex');
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  const regRes = await fetch(`${BASE}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'brooklyn-kitchen-smoke-test',
      redirect_uris: [REDIRECT_URI],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  });
  const client = await regRes.json().catch(() => ({}));
  if (!regRes.ok || !client.client_id) {
    fail('register', `HTTP ${regRes.status}\n${JSON.stringify(client)}`);
  }

  const authRes = await fetch(`${BASE}/authorize`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'smoke',
      token: TOKEN,
    }),
  });
  const location = authRes.headers.get('location');
  if (authRes.status !== 302 || !location) {
    const why = authRes.status === 401
      ? 'the access token was rejected — check SMOKE_TOKEN / MCP_ACCESS_TOKENS'
      : `expected a 302 redirect, got ${authRes.status}`;
    fail('authorize', why);
  }
  const code = new URL(location).searchParams.get('code');
  if (!code) fail('authorize', `no code in redirect: ${location}`);

  const tokRes = await fetch(`${BASE}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: client.client_id,
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT_URI,
    }),
  });
  const tokens = await tokRes.json().catch(() => ({}));
  if (!tokRes.ok || !tokens.access_token) {
    fail('token exchange', `HTTP ${tokRes.status}\n${JSON.stringify(tokens)}`);
  }
  return { client, tokens };
}

console.log(`\nSmoke-testing ${BASE}\n`);

if (!TOKEN) {
  console.error('No token available. Set SMOKE_TOKEN or MCP_ACCESS_TOKENS.');
  console.error('Locally:  node --env-file=../.env.local scripts/smoke-mcp.mjs\n');
  process.exit(2);
}

// ── 1. Runtime ──────────────────────────────────────────────────────────────
// First because it is the cheapest signal and the likeliest silent breakage.
const metaRes = await fetch(`${BASE}/api/meta`);
if (!metaRes.ok) fail('runtime (/api/meta)', `HTTP ${metaRes.status}`);
const meta = await metaRes.json();
const nodeMajor = Number(String(meta.node || '').replace(/^v/, '').split('.')[0]);
if (!nodeMajor) {
  fail('runtime (/api/meta)', `no node version reported: ${JSON.stringify(meta)}`);
}
if (nodeMajor < 20) {
  fail('runtime (/api/meta)',
    `Node ${meta.node} is too old — the MCP transport needs the global \`crypto\` (Node >= 19).\n`
    + 'OAuth will still work and every initialize will 400. Fix the runtime, not the code.');
}
pass('runtime', `node ${meta.node}, v${meta.version}, deployed ${meta.deployedAt}`);

// ── 2. OAuth discovery ──────────────────────────────────────────────────────
const prmRes = await fetch(`${BASE}/.well-known/oauth-protected-resource/mcp`);
if (!prmRes.ok) fail('oauth discovery', `HTTP ${prmRes.status} — is PUBLIC_URL correct?`);
const prm = await prmRes.json();
if (!prm.authorization_servers?.length) {
  fail('oauth discovery', `no authorization_servers: ${JSON.stringify(prm)}`);
}
pass('oauth discovery', prm.resource);

// ── 3. Full PKCE handshake ──────────────────────────────────────────────────
const { tokens } = await oauthDance();
pass('register → authorize → token', 'access + refresh token issued');

// ── 4. initialize — the step that silently 400'd ────────────────────────────
const init = await rpc({
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'smoke', version: '1' } },
}, { token: tokens.access_token });

if (!init.res.ok) {
  fail('initialize', `HTTP ${init.res.status}\n${init.text}`);
}
const sessionId = init.res.headers.get('mcp-session-id');
if (!sessionId) fail('initialize', `200 but no mcp-session-id header\n${init.text}`);
const initRpc = parseRpc(init.text);
if (!initRpc?.result?.protocolVersion) {
  fail('initialize', `unexpected body\n${init.text}`);
}
pass('initialize', `protocol ${initRpc.result.protocolVersion}, session ${sessionId.slice(0, 8)}…`);

await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' },
  { token: tokens.access_token, sessionId });

// ── 5. tools/list ───────────────────────────────────────────────────────────
const EXPECTED_TOOLS = [
  'get_this_week', 'add_shopping_item', 'update_shopping_item', 'get_meal_history',
  'get_planning_notes', 'add_planning_note', 'import_new_week',
];
const list = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' },
  { token: tokens.access_token, sessionId });
const names = (parseRpc(list.text)?.result?.tools || []).map(t => t.name);
const missing = EXPECTED_TOOLS.filter(t => !names.includes(t));
if (missing.length) {
  fail('tools/list', `missing: ${missing.join(', ')}\ngot: ${names.join(', ') || '(none)'}`);
}
pass('tools/list', `${names.length} tools`);

// ── 6. A real read, end to end ──────────────────────────────────────────────
const call = await rpc({
  jsonrpc: '2.0', id: 3, method: 'tools/call',
  params: { name: 'get_this_week', arguments: {} },
}, { token: tokens.access_token, sessionId });
const callRpc = parseRpc(call.text);
if (callRpc?.result?.isError || !callRpc?.result?.content?.[0]?.text) {
  fail('tools/call get_this_week', call.text.slice(0, 600));
}
let weekLabel = '(unparsed)';
try { weekLabel = JSON.parse(callRpc.result.content[0].text).weekLabel || weekLabel; } catch {}
pass('tools/call get_this_week', weekLabel);

// ── 7. Did OAuth state survive the last redeploy? ───────────────────────────
// The original bug was in-memory OAuth state: a redeploy wiped the client and
// refresh token, so Claude's stored credentials became invalid. A refresh token
// minted before the current deploy is the only real proof it's fixed.
if (!process.env.SMOKE_REFRESH_TOKEN) {
  skip('cross-deploy refresh', 'set SMOKE_REFRESH_TOKEN to a long-lived refresh token');
} else {
  const [clientId, refreshToken] = process.env.SMOKE_REFRESH_TOKEN.split(':');
  if (!clientId || !refreshToken) {
    fail('cross-deploy refresh', 'SMOKE_REFRESH_TOKEN must be "client_id:refresh_token"');
  }
  const res = await fetch(`${BASE}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    fail('cross-deploy refresh',
      `HTTP ${res.status} ${JSON.stringify(body)}\n`
      + 'OAuth state did not survive the deploy — Claude will show "server configuration issue".');
  }
  pass('cross-deploy refresh', 'pre-deploy credentials still valid');
}

const skipped = results.filter(r => r.skipped).length;
console.log(`\n✅ ${results.length - skipped} passed${skipped ? `, ${skipped} skipped` : ''} — ${BASE}\n`);
