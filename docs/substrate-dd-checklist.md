# Substrate-DD checklist for new API routes

**Status:** required reading before any new `/api/*` route is merged to main.
**Owner:** Lauren Kate de Mestre (substrate-DD discipline owner).
**Origin:** the cron-substrate audit of 2026-04-29 surfaced ~6 routes that referenced columns and tables that did not exist in production. The pattern: routes written against a planned schema before the migration was applied. Without a process correction, the same drift recurs every sprint.

This checklist is the correction. Every author of a new `/api/*` route, or any meaningful edit to an existing one, completes this checklist BEFORE merging the change.

---

## The checklist

### Schema (before writing the first DB query)

- [ ] **Every database table referenced exists in production.** Verify by:
  - Running `SELECT to_regclass('public.<table>')` against production Supabase via the dashboard SQL editor for each table the new route touches
  - OR confirming a migration file in `migrations/` (or `src/db/migrations/`) creates the table AND the migration has been applied
- [ ] **Every column referenced exists in production.** For each `.select(...)`, `.insert(...)`, `.update(...)`, `.eq(...)`, `.in(...)` call, verify column existence per table via:
  - `SELECT column_name FROM information_schema.columns WHERE table_name = '<t>'` in Supabase dashboard
  - OR confirming the column appears in `src/db/schema.ts` AND a migration has applied it
- [ ] **Every status / enum value matches the canonical definition.** For each `.eq('status', '<value>')` or analogous filter, verify the value is in the table's CHECK constraint definition (genesis migration `0000_mature_husk.sql` for primary tables, or the migration that added the column).
  - Common gotcha: production uses `'SUBMITTED'` / `'APPROVED'` / `'EXPORTED'`; never use `'PENDING_APPROVAL'` unless you have just added it via migration.
- [ ] **Every RPC function referenced exists.** If using `.rpc('<fn>', ...)`, confirm function exists in production (Supabase dashboard → Database → Functions).
- [ ] **Every Supabase Storage bucket referenced exists.** If using `.storage.from('<bucket>')`, confirm bucket exists.

### RLS + access (before merge)

- [ ] **RLS is enabled on every new table.** Per CLAUDE.md non-negotiable #2.
- [ ] **RLS policies are written and committed in the same migration as the CREATE TABLE.** No table ships without policies.
- [ ] **For SELECT policies, the USING clause is tenant-scoped.** Typically `company_id = (auth.jwt() ->> 'company_id')::uuid` or equivalent. Never `USING (true)`.
- [ ] **For INSERT policies, the WITH CHECK clause asserts company_id matches.** INSERT policies use `with_check`, not `using` (PostgreSQL semantics — verify with the RLS audit query in `rls-audit-query-2026-04-28.sql`).

### Auth + canonical patterns

- [ ] **Cron routes use `Authorization: Bearer ${CRON_SECRET}` exclusively.** No raw `x-cron-secret` header. No `?secret=` query parameter. The Vercel-documented Bearer pattern is canonical per the cron-substrate audit 2026-04-29.
- [ ] **Worker / supervisor / admin auth uses the helper functions in `src/lib/auth/`.** Don't reinvent JWT parsing per route.
- [ ] **Tenant scope is asserted at the application layer for every `/api/command/*` route**, not just relied on at the RLS layer (per GAP-A3-001 fix plan 2026-04-29).

### Substrate-claims-vs-reality (added 2026-04-30 per labour-hire-workflow-gap-analysis-2026-04-29 §4.2)

- [ ] **For every load-bearing problem statement in customer-facing copy, trace the claim to the substrate code that addresses it.** Surfaces include the marketing landing page (`src/components/shared/LandingPage.tsx`), worker FAQ (`src/content/worker/faq.md`), employer onboarding pages, regulatory submission language, and pages under `flosmosis.com/wles/*`. If the claim describes a problem the substrate doesn't actually solve, the claim is aspirational and must be reframed or scheduled for build *before* publication. Triggered by today's findings: the LandingPage line 841 overtime / roster narrative implies features that don't exist; the FAQ "tap to take a break" claim has no break event in the codebase; the FAQ "supervisor email fallback" claim referenced a now-disabled cron. Pattern is consistent across all three.

### Production CHECK-constraint verification (added 2026-04-30)

- [ ] **Before any audit cites a `shifts.status` or other enum value, query the production CHECK constraint directly.** Run `grep -E "CHECK.*<column>.*IN" migrations/*.sql src/db/migrations/*.sql` to enumerate canonical values from migration history; do not infer from observed row data alone. Production may allow values that simply have not yet been populated in any row. Triggered by today's G9 finding: `intelligence-collusion-pairs/route.ts` filtered on `status === 'APPROVED'` which is not in the production constraint (constraint allows `SUPERVISOR_APPROVED, PAYROLL_APPROVED, EXPORTED`). Cron silently never fired because the numerator was always zero; data observation alone could not have caught this because no rows had been approved yet.

### Inline / sync paths must not assume cron preconditions (added 2026-04-30)

- [ ] **If a synchronous code path filters on a field that is only stamped by a cron (e.g. `last_X_at = today`), verify the inline path's behaviour when the cron has not yet run today.** The inline path must either (a) handle the no-precondition case directly, or (b) document explicitly that it relies on cron precedence and accept the resulting no-op edge case. Triggered by today's G1 finding: the supervisor SMS late-trigger filtered to supervisors with `last_batch_sms_date = today`, which silently no-ops on single-shift soft-launch tenants whose 16:30 cron has nothing to batch. Same defect class as the supervisor-batch HTTP method drift — a precondition the substrate quietly assumed.

### HTTP method verification for Vercel cron routes (added 2026-04-29 PM)

- [ ] **For every entry in `vercel.json` `crons[]`, the route exports a handler matching the HTTP verb Vercel Cron uses (GET).** Vercel Cron invokes the configured path with **GET** and does NOT support method configuration in `vercel.json`. Open the route source and grep for `export async function GET`. If only `POST` / `PUT` / `PATCH` / `DELETE` is exported, Vercel cron will hit it with GET and return 405 Method Not Allowed — silently in Vercel logs unless you're explicitly tracking 4xx rates per route.
  - Verify by command: `grep -nE "^export async function (GET|POST|PUT|PATCH|DELETE)" src/app/api/cron/<route>/route.ts` — confirm `GET` is in the output.
  - If the canonical handler must remain `POST` (e.g. for semantic clarity that the route mutates state), add a 3-line `export async function GET(request: Request) { return POST(request); }` delegate at the bottom of the file. Single source of truth preserved; both manual POST callers and Vercel cron's GET work.
  - Common gotcha: this defect is invisible during low-traffic phases (broken cron has nothing to do, so the 405 doesn't surface as missed work). It only becomes visible when the system has real load — which for FLOSTRUCTION is post-Joao soft-launch. The substrate-DD finding that triggered this checklist entry is exactly this pattern: `/api/cron/supervisor-batch` was 405-erroring on every Vercel cron invocation since deployment, masked by the production tenant having no shifts in `'SUBMITTED'` status to batch.
  - This check would have caught the supervisor-batch GET/POST drift in the original cron-substrate-audit-2026-04-29; it did not because the audit verified auth + schema but not method.

### Email / SMS templates

- [ ] **Email from-addresses use `process.env.CONTACT_EMAIL_FROM` with the canonical default `'FLOSTRUCTION <noreply@flosmosis.com>'`.** Never hardcode `noreply@wohjo.app` (retired) or `noreply@flosmosis.com.au` (different domain).
- [ ] **SMS templates use `composeBatchSMS` from `src/lib/sms/compose.ts`.** Do not write speculative SMS templates inline; the production template lives there and is tested.
- [ ] **Substrate-aligned wording.** Records, approvals, integrity, auth — never "earnings", "wages", or any framing that implies Flostruction calculates payroll. FLOSTRUCTION is records substrate (memory #18); payroll systems calculate.

### Testing (before merge)

- [ ] **The route has been tested against a Supabase instance, not just unit-tested with mocks.** Either:
  - A staging Supabase project that mirrors production schema, OR
  - A manual `curl` against production after deploy (with eyes on Vercel logs for errors)
- [ ] **Unit tests exist that would have caught the drift this route is closing.** If you added a new column to `shifts`, write a test that fails when that column doesn't exist.
- [ ] **`tsc --noEmit` exits 0.**
- [ ] **`npx vitest run` exits 0.**

### Documentation (before merge)

- [ ] **Route header comment cites the source-of-truth.** If implementing per a planning document, the document is committed to the repo (`docs/<topic>.md`) — do not reference an out-of-tree planning doc that may go missing (the approval-fallback drift was caused by a `Task9_EmailFallback_Gate.txt` reference that was never written).
- [ ] **CREDENTIAL REQUIRED comments name every env var the route reads.** Future operators need to see the env-var dependency surface in one place per route.

### Public-facing surface (separate gate)

If the route's response is rendered to a public-facing surface (homepage, marketing pages, public emails, public docs, /field UI):

- [ ] **Founder authorisation in chat or commit message.** Per the brand-surface tripwire (`substrate-dd-pack-2026-04-28/methodology-notes.md` "Brand-surface change requires founder authorisation").
- [ ] **Canonical-design source.** Per the marketing-substrate alignment finding, public-facing surfaces source from `design-branch/all-screens.html` (or equivalent canonical) rather than originating new artwork.

---

## The fast path

If you're tempted to skip the checklist for a "simple" change: read the cron-substrate audit of 2026-04-29 first. The substrate-DD finding that triggered this checklist was 6 routes silently 500-erroring in production for 3 days because someone wrote a route against a planned schema. The cost of skipping the checklist exceeds the cost of running through it.

---

## CI / pre-commit hook proposal

A future iteration of substrate-DD discipline will encode parts of this checklist as a CI / pre-commit hook. Design proposal (not yet implemented; surface for founder review before building):

### Option A — Generate TypeScript types from production Supabase schema

```bash
# Quarterly + on-demand
supabase gen types typescript --project-id <id> > src/types/database.types.ts
git diff src/types/database.types.ts   # confirm expected drift
```

Routes import types from this file. Any column reference that doesn't match production fails `tsc`.

**Pros:** compile-time enforcement; zero runtime cost; impossible to merge a column-name typo against production.

**Cons:** requires Supabase project access on the developer's machine; out-of-band when production schema changes between regenerations.

### Option B — SQL parsing CI check

A CI step that parses every Supabase query string in the codebase, extracts table + column references, and asserts they exist in `migrations/` history.

**Pros:** doesn't require Supabase access in CI; static analysis only.

**Cons:** parsing PostgREST query DSL (`.from('...').select('...').eq(...)`) is non-trivial; false positives on complex chains.

### Option C — Periodic CI cron-health check

A scheduled CI job (daily) that hits each cron endpoint with `Authorization: Bearer ${CI_CRON_SECRET}` and asserts 200 responses. Failure breaks the build.

**Pros:** catches runtime drift even if static checks pass; mirrors actual production exercise.

**Cons:** requires an extra Vercel deployment (staging) so CI doesn't ping production; flaky against external dependencies (Twilio, Resend).

### Recommendation

**Option A as primary** + **Option C for cron endpoints only** as defence-in-depth.

Implementation effort: ~4-6 hours for Option A initial setup; ~2-3 hours for Option C cron-only health check.

Defer until post-Mo soft-launch unless a second drift incident occurs first.

---

## Sign-off

Checklist published 2026-04-29 to `docs/substrate-dd-checklist.md`. Re-read at each major refactor. Update as new substrate-DD findings surface.
