# Cross-tenant isolation test suite — A3

## Status: GAP-A3-001 and GAP-A3-002 CLOSED (Day 5, 2026-04-22)

Day-5 closure note:

- Migrations `202604220900_create_admins_table.sql` and
  `202604220905_workers_user_id.sql` applied to production Supabase
  (verified 2026-04-22 by Lauren's direct SQL-editor run; 6-row
  verification shape matched).
- Three auth helpers shipped in `src/lib/auth/`:
  `getCompanyIdForSession`, `requireCompanyMembership`,
  `requireWorkerIdentity`. All three emit structured pino WARN on
  rejection paths and unit-tested to 15/15 green.
- 13 `/api/command/*` routes refactored to derive `company_id` from
  the session admin's `admins` row. Zero `company_id` still read
  from request body/query. Enforced by 39 contract tests in
  `boundaries.test.ts`.
- 7 `/api/field/*` routes refactored to derive `worker_id` from the
  Supabase phone-OTP session via `requireWorkerIdentity`. Zero
  `worker_id` or `phone` still read from query string. Enforced by
  21 contract tests.
- Legacy `requireCommandAuth` no longer imported anywhere under
  `src/app/api/` (enforced by 1 recursive-scan test).
- Full suite state at closure: **428 passed · 2 skipped · 0 failed**
  across 15 test files + 1 skipped live file.
  `tsc --noEmit` → EXIT 0.

## Purpose

Every multi-tenant boundary in the WOHJO product must hold under every
hostile input an authenticated user at Customer-A can construct while
trying to read or mutate data belonging to Customer-B. These tests
encode those boundaries as assertions.

The model customers are **Acme Labour Hire** (tenant A) and **Bravo
Labour Hire** (tenant B). Each has 15 workers × 3 sites × 50 shifts.

## Files

| File | Purpose |
|---|---|
| `README.md` (this file) | Model + closure summary |
| `fixtures.ts` | Synthetic Acme/Bravo fixture generators |
| `boundaries.test.ts` | Day-5 contract tests + fixture sanity + live-run scaffold |
| `audit-A3-001.md` | Original Day-2 audit table (historical record of the gap) |

## Coverage summary (Day 5 post-closure)

| Layer | Test count | Behaviour asserted |
|---|---|---|
| Fixture sanity | 4 | UUID determinism, count invariants, cross-tenant non-overlap |
| Class A command routes × 13 routes × 3 assertions | 39 | Each route imports `getCompanyIdForSession` (or `requireCompanyMembership` for `shifts/[id]`); does NOT import legacy `requireCommandAuth`; does NOT read `company_id` from body/query |
| Class B field routes × 7 routes × 3 assertions | 21 | Each route imports `requireWorkerIdentity`; does NOT read `worker_id` from query; does NOT read `phone` from query |
| Legacy retirement | 1 | Recursive scan confirms `requireCommandAuth` is not imported anywhere under `src/app/api/` |
| Live-run scaffold | 1 (skipped) | `RUN_LIVE_A3=1` switches on the live HTTP test path |
| **Total** | **66** (65 active + 1 live-gated) | |

## Running

```bash
# Default — contract tests only, no network:
npx vitest run tests/cross-tenant

# Live HTTP against a deployed stack (future):
RUN_LIVE_A3=1 npx vitest run tests/cross-tenant
```

## Closed gaps — evidence

### GAP-A3-001 — /api/command/* accepted client-supplied company_id

**Status: CLOSED.** Route refactor commits (logical commit names;
WOHJO `.git` in the sandbox is a placeholder — Lauren commits locally):

- `feat(a3-001): derive company_id server-side on /api/command/approvals`
- `feat(a3-001): derive company_id server-side on /api/command/audit`
- `feat(a3-001): derive company_id server-side on /api/command/audit/download`
- `feat(a3-001): derive company_id server-side on /api/command/audit-trail`
- `feat(a3-001): derive company_id server-side on /api/command/export`
- `feat(a3-001): derive company_id server-side on /api/command/intelligence`
- `feat(a3-001): derive company_id server-side on /api/command/sites`
- `feat(a3-001): derive company_id server-side on /api/command/super-evidence`
- `feat(a3-001): derive company_id server-side on /api/command/supervisors`
- `feat(a3-001): derive company_id server-side on /api/command/workers`
- `feat(a3-001): add requireCompanyMembership guard on /api/command/shifts/[id]/adjust`
- `feat(a3-001): add requireCompanyMembership guard on /api/command/shifts/[id]/approve`
- `feat(a3-001): add requireCompanyMembership guard on /api/command/shifts/[id]/dispute`

### GAP-A3-002 — /api/field/* accepted client-supplied worker_id/phone

**Status: CLOSED.** Route refactor commits:

- `feat(a3-002): derive worker identity server-side on /api/field/worker`
- `feat(a3-002): derive worker identity server-side on /api/field/home-data`
- `feat(a3-002): derive worker identity server-side on /api/field/earnings/week`
- `feat(a3-002): derive worker identity server-side on /api/field/shifts/week`
- `feat(a3-002): derive worker identity server-side on /api/field/shift/start`
- `feat(a3-002): guard shift ownership on /api/field/shift/end`
- `feat(a3-002): guard receipt ownership on /api/field/receipt/[receiptId]`

Client call site update:

- `feat(a3-002): drop phone query param from /field sign-in POST`
