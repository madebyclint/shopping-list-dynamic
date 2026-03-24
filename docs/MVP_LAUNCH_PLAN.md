# MVP Launch Plan: Shopping List → Public SaaS

**Last Updated:** March 23, 2026  
**Stack:** Next.js 15, PostgreSQL (Railway), Claude (Anthropic), Clerk (Auth), Stripe (Billing)

---

## Key Decisions

| Decision | Choice |
|----------|--------|
| Audience | Public SaaS — open to anyone |
| Authentication | Magic-link / passwordless email (Clerk) |
| AI Model | Claude (Anthropic) — replacing OpenAI GPT-4 |
| Data Model | Family units — members share data, isolated from other families |
| Billing | Paid subscriptions (Stripe), 14-day free trial, developer covers API costs |

---

## Epics

| ID | Epic | What It Covers |
|----|------|----------------|
| **E1** | Authentication & Identity | Clerk magic-link, user/family tables, route protection |
| **E2** | Multi-Tenancy & Data Isolation | `family_id` on all tables, scoped API queries, invite system |
| **E3** | Claude AI Integration | Swap OpenAI → Anthropic SDK, token tracking |
| **E4** | Family Profiles & Personalization | Remove hardcoded "Brooklyn family of 4", onboarding flow |
| **E5** | Billing & Subscriptions | Stripe, subscription gate on AI features, trial period |
| **E6** | Security & Reliability | Auth audit on all 38 routes, rate limiting, known bug fixes |
| **E7** | Launch Readiness & Ops | Monitoring, health checks, production env, public landing page |

---

## Milestones

| Milestone | After Sprint | Definition of Done |
|-----------|--------------|-------------------|
| **M1 — Private Alpha** | Sprint 2 | Sign up, log in, all app data scoped to your account. Works across devices. |
| **M2 — Friends & Family Beta** | Sprint 4 | Family units + invites working, Stripe billing live, 14-day trial. Safe to send to real users. |
| **M3 — Public Launch** | Sprint 6 | Security audit done, monitoring live, all 38 routes auth-guarded, public landing page exists. |
| **M4 — Post-Launch Stable** | Sprint 7 | First real user bugs fixed, receipt OCR polished, edit/delete lists shipped. |

---

## Sprint Plan (2-week sprints)

### Sprint 1 · Apr 7–18 · Auth Foundation `[E1]`

**Goal:** Any user can sign up and log in. Existing app still works.

| # | Task |
|---|------|
| 1 | Install `@clerk/nextjs`, configure dev Clerk project |
| 2 | Add `ClerkProvider` to `app/layout.tsx`, configure magic-link email |
| 3 | Create `middleware.ts` — protect all routes, allow `/`, `/api/health`, `/sign-in` publicly |
| 4 | Create `users` DB table: `id`, `clerk_user_id`, `email`, `family_id`, `created_at` |
| 5 | Create `families` DB table: `id`, `name`, `created_by`, `subscription_status`, `trial_ends_at` |
| 6 | Create Clerk webhook handler (`/api/webhooks/clerk`) — insert into `users` on first sign-in |
| 7 | Add `/sign-in` and `/sign-up` pages using Clerk components |
| 8 | Smoke test: sign up → land on app → existing data visible |

**Done when:** User can register with email, receive magic link, sign in, and see the app.

---

### Sprint 2 · Apr 21–May 2 · Multi-Tenancy Core `[E2]` → 🏁 M1

**Goal:** Each family has completely isolated data.

| # | Task |
|---|------|
| 1 | Write DB migration: add `family_id` to all 9 core tables + receipts/analytics tables |
| 2 | Seed existing data into a `demo_family` record (no data loss) |
| 3 | Create auth helper `getFamilyId(request)` — reads Clerk session, looks up `users.family_id`, throws 401 if missing |
| 4 | Update all 38 API routes: call `getFamilyId()`, scope every query with `WHERE family_id = $n` |
| 5 | Create family invite system: `family_invites` table, `POST /api/families/invite`, `GET /api/invite/[token]` accept page |
| 6 | Add family settings UI: show members, send invite by email, leave family |
| 7 | Auto-create family on first sign-in if user has no `family_id` |

**Done when:** Sign in as User A and User B — zero data bleeds between them.

---

### Sprint 3 · May 5–16 · Claude Swap + Family Profiles `[E3, E4]`

**Goal:** App uses Claude API; prompts reflect the actual family's preferences.

**E3 — Claude Swap:**

| # | Task |
|---|------|
| 1 | `npm uninstall openai && npm install @anthropic-ai/sdk` |
| 2 | Rewrite `app/api/menus/route.ts` — replace `OpenAI` client with `Anthropic`, use `claude-sonnet-4-5` model |
| 3 | Rewrite `app/api/meals/alternatives/route.ts` and `app/api/meals/enhance` similarly |
| 4 | Update `ai_usage_stats` tracking: use `input_tokens`/`output_tokens` from Anthropic response |
| 5 | Swap env var `OPENAI_API_KEY` → `ANTHROPIC_API_KEY` in Railway + `.env.local` |

**E4 — Family Profiles:**

| # | Task |
|---|------|
| 6 | Add `family_profiles` table: `family_id`, `family_size`, `location`, `dietary_restrictions`, `cuisine_preferences`, `weekly_budget` |
| 7 | Build onboarding page (shown after first sign-in): fill in family profile |
| 8 | Replace hardcoded Brooklyn/family-of-4 values in Claude prompt with DB-fetched family profile data |
| 9 | Add "Edit Family Preferences" section to family settings page |

**Done when:** Claude generates menus tailored to each family's real profile. OpenAI package removed.

---

### Sprint 4 · May 19–30 · Billing & Subscriptions `[E5]` → 🏁 M2

**Goal:** Users pay before accessing AI features. Trial works.

| # | Task |
|---|------|
| 1 | Set up Stripe: create "Shopping List Pro" monthly product, get test API keys |
| 2 | Add `/api/stripe/create-checkout-session` — creates Stripe Checkout for family subscription |
| 3 | Add `/api/stripe/webhook` — handle `checkout.session.completed`, `customer.subscription.deleted`; update `families.subscription_status` |
| 4 | Add `requiresSubscription()` helper — returns 402 if not subscribed and trial expired |
| 5 | Gate with subscription check: `/api/menus`, `/api/meals/alternatives`, `/api/meals/enhance`, `/api/receipts/analyze` |
| 6 | Set `families.trial_ends_at = now() + 14 days` on family creation |
| 7 | Build billing UI: plan status, "Upgrade" CTA → Stripe Checkout, "Manage" → Stripe Customer Portal |
| 8 | Build paywall page for non-subscribed users hitting gated routes |
| 9 | Switch Stripe to live mode, test with real card end-to-end |

**Done when:** New user → 14-day trial → AI works → trial expires → paywall → pays → access restored.

---

### Sprint 5 · Jun 2–13 · Security & Reliability `[E6]`

**Goal:** Every API route is hardened. Known bugs are fixed.

**Security Audit:**

| # | Task |
|---|------|
| 1 | Verify all 38 API routes call `getFamilyId()`, no unscoped queries |
| 2 | Add rate limiting on AI endpoints: max 3 menu generations/day/family |
| 3 | Audit receipt upload: validate file type, size limit, no path traversal |
| 4 | Verify `isomorphic-dompurify` applied in all import routes |
| 5 | Remove dev-only env var bypasses (`FORCE_DATABASE` must not disable auth) |
| 6 | Clerk webhook verifies signature via `svix` library |

**Known Bug Fixes (from ToDo-Notes.md):**

| # | Task |
|---|------|
| 7 | Implement Edit/Delete shopping lists (currently missing) |
| 8 | Fix ingredient deduplication & case normalization |
| 9 | Clean up data migration edge cases |

**Done when:** Security checklist complete. Edit/delete lists works. No unscoped DB queries.

---

### Sprint 6 · Jun 16–27 · Launch Readiness `[E7]` → 🏁 M3

**Goal:** App is publicly launchable — monitored, documented, has a front door.

| # | Task |
|---|------|
| 1 | Add Sentry free tier: `npm install @sentry/nextjs`, capture errors in API routes |
| 2 | Add `/api/health`: checks DB connectivity, returns `{ status: "ok", db: true }` |
| 3 | Set up Railway production environment: all prod env vars configured |
| 4 | Create Clerk production instance (separate from dev dashboard) |
| 5 | Build public landing page (`/`) — shown to signed-out users: features, pricing, "Get Started" |
| 6 | Write privacy policy and terms of service pages |
| 7 | Configure custom domain in Railway (if applicable) |
| 8 | End-to-end test full user journey: sign up → onboarding → trial → AI menu → shopping → billing → cancel |

**Done when:** Live on production URL. New user completes full journey without dev intervention.

---

### Sprint 7 · Jun 30–Jul 11 · Post-Launch Stabilization → 🏁 M4

**Goal:** First real user issues resolved, receipt flow polished.

| # | Task |
|---|------|
| 1 | Fix top bugs reported by early users (Sentry + user feedback) |
| 2 | Polish receipt OCR flow — cost extraction refinement |
| 3 | Complete advanced analytics dashboard (trends view incomplete) |
| 4 | Add real-time sync foundations for collaborative check-off |
| 5 | Performance: review DB query plans under real load |
| 6 | Transactional email: "Your trial ends in 3 days" via Clerk |

---

## Key Files

| File | Sprint | Change |
|------|--------|--------|
| `app/layout.tsx` | S1 | Add `ClerkProvider` |
| `middleware.ts` *(new)* | S1 | Clerk route protection |
| `app/api/webhooks/clerk/route.ts` *(new)* | S1 | User sync on sign-up |
| `lib/database/index.ts` | S1–S2 | New tables: users, families, family_invites, family_profiles |
| `lib/database.ts` | S2 | Add `getFamilyId()` helper, `family_id` filter on all queries |
| `app/api/menus/route.ts` | S3 | Swap OpenAI → Anthropic client |
| `app/api/meals/alternatives/route.ts` | S3 | Swap OpenAI → Anthropic |
| `app/onboarding/page.tsx` *(new)* | S3 | Family profile setup |
| `app/api/stripe/` *(new)* | S4 | Checkout + webhook routes |
| `app/billing/page.tsx` *(new)* | S4 | Billing management UI |
| `railway.toml` | S6 | Production env var references |

---

## Environment Variables

| Variable | Added In | Purpose |
|----------|----------|---------|
| `POSTGRES_URL` | Existing | Database connection (Railway auto-provided) |
| `ANTHROPIC_API_KEY` | Sprint 3 | Claude AI (replaces `OPENAI_API_KEY`) |
| `CLERK_SECRET_KEY` | Sprint 1 | Clerk server-side auth |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Sprint 1 | Clerk client-side |
| `CLERK_WEBHOOK_SECRET` | Sprint 1 | Verify Clerk webhook signatures |
| `STRIPE_SECRET_KEY` | Sprint 4 | Stripe server-side |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Sprint 4 | Stripe client-side |
| `STRIPE_WEBHOOK_SECRET` | Sprint 4 | Verify Stripe webhook signatures |
| `SENTRY_DSN` | Sprint 6 | Error monitoring |

---

## Verification Checkpoints

**M1 — Private Alpha:**
- [ ] Sign up on device A → log in on device B → same data appears
- [ ] Two separate users sign up → zero data overlap

**M2 — Friends & Family Beta:**
- [ ] User A invites User B → B joins A's family → shared data, not User B's original data
- [ ] Stripe test mode: subscribe → cancel → access revoked within session
- [ ] 14-day trial countdown works, expires correctly, paywall shown

**M3 — Public Launch:**
- [ ] Sentry receives a test error (verify monitoring works)
- [ ] `/api/health` returns 200 with `{ db: true }`
- [ ] All 38 API routes return 401 for unauthenticated requests
- [ ] New user completes full sign-up → AI menu journey without developer help

**M4 — Stable:**
- [ ] Zero critical Sentry errors from first week of real users
- [ ] Receipt OCR correctly extracts prices on 5 test receipts
- [ ] Edit/delete list smoke test passes

---

## Scope: Included vs. Deferred

**Included in MVP:**
- Magic-link email auth (Clerk)
- Family-level data sharing (not per-user within a family)
- Claude-only AI — OpenAI removed
- Single subscription tier (flat monthly)
- 14-day free trial

**Deferred to post-launch (v1.1+):**
- Real-time collaborative check-off (WebSocket)
- Per-user dietary preferences within a family
- Google / social login (OAuth)
- Mobile app or PWA
- Usage-based billing
- Admin dashboard for managing subscribers
- Waste reduction tracking UI
