# Brooklyn Kitchen — Setup & Operations

The weekly meal-planning dashboard, plus the MCP server that lets Claude read and write it
directly. Deployed on Railway with Postgres.

- **Planning rules and output format** → [INSTRUCTIONS.md](INSTRUCTIONS.md). That file is
  returned in full by the `get_meal_history` tool, so it stays focused on meal planning.
  Setup and ops live here instead, deliberately, to keep it out of every planning prompt.

---

## Connecting the MCP Connector to Claude

One-time setup. After this, the tools are available in any chat.

**1. Get the household access token.** It's the `MCP_ACCESS_TOKENS` env var on the Railway
service. The format is `label:token` (comma-separated for multiple people) — you enter just
the token part, after the colon.

**2. Add the connector.** In Claude → **Settings → Connectors → Add custom connector**, use:

```
https://weekly-menus-manually-generated-production.up.railway.app/mcp
```

**3. Click Connect.** A Brooklyn Kitchen sign-in page appears. Enter the token from step 1.
Claude registers itself automatically (dynamic client registration) — there's no client ID or
secret to configure.

**4. Enable it in a chat.** Open the tools menu and turn on Brooklyn Kitchen. You should see
7 tools: `get_this_week`, `add_shopping_item`, `update_shopping_item`, `get_meal_history`,
`get_planning_notes`, `add_planning_note`, `import_new_week`.

The connection survives redeploys — the OAuth client and its refresh token are stored in
Postgres, not in process memory.

### Requirements that are easy to break

- **Node ≥ 20.** The MCP SDK's transport calls the bare global `crypto`, which doesn't exist
  before Node 19. On an older runtime OAuth still completes and then every `initialize` fails
  with a 400 — a connector that authenticates but never attaches. Pinned via `engines` and
  `.nvmrc`, with a `globalThis.crypto` shim in `server.mjs` as backup.
- **`PUBLIC_URL` / `RAILWAY_PUBLIC_DOMAIN`** must match the real hostname. OAuth discovery
  advertises absolute URLs built from it; if it's wrong, Claude is sent to endpoints that
  don't exist.
- **`DATABASE_URL` / `POSTGRES_URL`** must be set. OAuth state lives in Postgres now, so
  without it nothing can connect at all.

---

## Verifying a Deploy

Runs automatically — **[.github/workflows/smoke-mcp.yml](../.github/workflows/smoke-mcp.yml)**
on every push to `main` that touches this folder, daily at 11:00 UTC, and on demand via
*Actions → MCP smoke test → Run workflow*. On a push it waits for Railway to report the new
version before testing, so it checks the new container rather than the one being replaced.

Manually:

```bash
npm run smoke:mcp
```

It walks the whole chain and exits non-zero on the first failure:

1. `GET /api/meta` — asserts Node major ≥ 20
2. `GET /.well-known/oauth-protected-resource/mcp` — discovery metadata resolves
3. `POST /register` → `POST /authorize` → `POST /token` — the full PKCE handshake
4. `POST /mcp` `initialize` — **asserts 200 and a session id** (the step that silently 400'd)
5. `tools/list` — all 7 tools present
6. `tools/call get_this_week` — real data comes back
7. `GET /authorize` with a pre-existing `client_id` — proves OAuth state survived the redeploy

**Point it at the deployed URL, not localhost.** Both outages were environmental — correct
code on a bad runtime, and state lost on restart — and neither is visible to a local test.

### One-time setup

```bash
npm run smoke:token     # registers a probe client, prints SMOKE_CLIENT_ID
```

Put `SMOKE_CLIENT_ID` in `.env.local`, and set these in **Settings → Secrets and variables →
Actions** so CI can run:

| Name | Kind | Value |
|------|------|-------|
| `SMOKE_TOKEN` | secret | The deployed `MCP_ACCESS_TOKENS` value (just the part after `label:`) |
| `SMOKE_CLIENT_ID` | secret | Output of `npm run smoke:token` |
| `SMOKE_BASE_URL` | variable | Optional — defaults to the production URL |

`SMOKE_TOKEN` matters because the deployed token is **not** necessarily your local one. If
step 3 fails with "the access token was rejected", that mismatch is why.

Step 7 checks the registered *client*, not a refresh token, on purpose: refresh tokens rotate
on use, so a stored one would pass once and then fail every run after — a check that breaks
itself is worse than no check. It does mean step 7 covers `oauth_clients` but not
`oauth_tokens`; there is no way to verify a refresh token without spending it.

A quick manual version of the two checks that matter most:

```bash
curl -s https://weekly-menus-manually-generated-production.up.railway.app/api/meta
```

That returns `version`, `deployedAt`, `env`, and `node` — if `node` is below v20, stop there,
that's the bug.

---

## Troubleshooting

**"This connector has a server configuration issue."** Claude's generic message for an
unusable server. It never means your account. Work outward:

| Check | Command / where | What's wrong if it fails |
|-------|-----------------|--------------------------|
| Server is up | `curl .../health` | Deploy crashed — check Railway logs |
| Runtime | `curl .../api/meta` → `node` | Below v20 breaks `initialize` (see above) |
| Discovery | `curl .../.well-known/oauth-protected-resource/mcp` | `PUBLIC_URL` is wrong |
| Auth reaches the server | `curl -X POST .../mcp` with no header | Should be **401** with a `WWW-Authenticate` header. Anything else means the auth middleware isn't wired. |
| Tokens survived | `SELECT count(*) FROM oauth_clients` | Empty after a redeploy means OAuth state isn't persisting |

**Reading the Railway logs.** A healthy connect is `/register` 201 → `/authorize` 302 →
`/token` 200 → `/mcp` 200. If OAuth succeeds and `/mcp` returns 400, the problem is the
transport, not the auth — the two use different code paths, which is exactly why a broken
`initialize` can hide behind a clean handshake.

**Getting the real error.** A 400 from `/mcp` carries the reason in its JSON body, which the
Connectors dialog never shows you. Replay Claude's own request with a valid token to see it:

```bash
curl -s -X POST "$BASE/mcp" -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}'
```

`$TOKEN` can be the static `MCP_ACCESS_TOKENS` value — it's accepted directly as a bearer
token, so you can test without the OAuth dance.

**Forcing a clean reconnect.** Clearing the stored clients makes Claude re-register on the
next Connect; it doesn't affect any meal data:

```sql
DELETE FROM oauth_clients; DELETE FROM oauth_tokens;
```

---

## Local Development

```bash
npm run dev
```

Reads env from `../.env.local` and serves on `PORT` (default 8080). It connects to the
**production** Postgres, so writes are real — use a scratch port and read-only tools when
poking at MCP behavior.

To reproduce an old-runtime bug without installing an old Node, delete the global before the
server loads:

```bash
node --import ./scripts/no-global-crypto.mjs server.mjs
```

### Useful scripts

| Command | What it does |
|---------|--------------|
| `npm start` | Production server |
| `npm run dev` | Local server with `../.env.local` |
| `npm run smoke:mcp` | Post-deploy verification (above) |
| `npm run smoke:mcp:ci` | Same, without `--env-file` — for CI, where env comes from secrets |
| `npm run smoke:token` | Register the smoke-probe client, print `SMOKE_CLIENT_ID` |
| `npm run migrate` | Push on-disk files to the database — the legacy path, still the fallback |
| `npm run prompt` | Generate the meal-plan prompt for pasting into a chat |

---

## How the Pieces Fit

| Piece | Role |
|-------|------|
| `server.mjs` | Express app: dashboard, JSON API, OAuth server, MCP server |
| Postgres | Source of truth. The dashboard reads the DB, not the files on disk. |
| `index.html` | Dashboard — menu, shopping list, audit, history, archive, prices |
| `menus/`, `shopping-lists/`, `data.json` | Legacy on-disk copies, pushed up by `npm run migrate` |
| `INSTRUCTIONS.md` | House rules + output format, served to Claude by `get_meal_history` |

**OAuth tables** — `oauth_clients`, `oauth_codes`, `oauth_tokens`. Created by `initDb()` on
boot; expired codes and access tokens are pruned every 15 minutes. Rotated refresh tokens stay
valid for a 2-minute grace window so a retried token request can't strand the connector.
