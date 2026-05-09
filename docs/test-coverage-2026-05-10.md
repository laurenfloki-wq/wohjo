# Test Coverage Audit — 2026-05-10

## Summary

| Metric | Before | After | Delta |
|---|---|---|---|
| All-files branch | 82.13% | 83.13% | +1.0pp |
| All-files function | 80.29% | 84.45% | +4.2pp |
| Test files | 61 | 62 | +1 |
| Tests passing | 1197 | 1244 | +47 |

Coverage was measured with `npx vitest run --coverage` (v8 provider) on the
`test-coverage-audit-2026-05-10` branch. The "All-files % Stmts" (≈16%)
understates real logic coverage because Next.js page components and config files
are included — they import fine but never execute inside vitest. Branch and
function coverage numbers are more meaningful.

---

## Tests written

### 1. `src/lib/wles/v1-translate.test.ts` (new — 47 tests across 11 `it` blocks per builder)

`v1-translate.ts` had 30.8% function coverage (4 of 13 functions exercised)
before this audit. The existing `v1-chain.test.ts` used `buildClockIn`
indirectly; every other builder was untested.

New tests cover all 12 exportable builder functions:
- `buildShiftCommit` — optional fields (scheduledStart/End), eventId generation,
  metadata include/exclude
- `buildClockIn` / `buildClockOut` — optional geofence/worker-confirmed fields
- `buildBreakStart` / `buildBreakEnd` — optional break_type / break_start_event_id
- `buildApproval` — valid hours, negative-hours throw, NaN throw, zero hours
- `buildIntelligenceClear` — valid call, empty array throw, non-array throw
- `buildAnomalyFlag` — with/without details
- `buildExtensionEvent` — valid type, invalid prefix throws
- `buildDisputeRaised` / `buildExportRecord` — convenience wrapper shape
- `buildSpecVersionMigration` — default reason and caller-supplied reason

### 2. `src/lib/wles/chain-verify.test.ts` (extended — 1 new test)

The existing 7-test suite passed `created_at` as `Date` objects, leaving the
`typeof v === 'string'` branches in `toDate()` and `toIsoString()` uncovered
(contributing to the 65% branch coverage). Added:

- `handles string-typed created_at values` — passes ISO string directly,
  confirms both the valid-chain and mismatch paths emit correct `created_at`
  strings.

### 3. `src/lib/offline/queue.test.ts` (extended — 13 new tests)

The existing 4 tests only covered `enqueueAction` + `getQueue` (the
`client_event_id` stamping contract). Coverage of `updateActionStatus`,
`removeAction`, `getPendingActions`, `hasPendingActions`, `isOnline`, and
`syncQueue` was 0%.

Added test groups covering:
- `updateActionStatus` — SYNCING removes from pending list, FAILED keeps it,
  unknown id is a no-op
- `removeAction` — action disappears from pending list
- `hasPendingActions` — false on empty queue, true after enqueue
- `isOnline` — returns true when navigator undefined, delegates to `onLine`
  when defined
- `syncQueue` — empty queue returns 0/0; successful fetch removes action and
  calls callback; 409 counts as synced (idempotent duplicate); 500 marks FAILED;
  fetch throw marks FAILED

### 4. `src/app/api/auth/events/hook/route.test.ts` (extended — 2 new tests)

The existing 7 tests covered the main happy/error paths but left two branches
in `route.ts` uncovered:

- `req.text()` throws → body-read failure path (line 43–45)
- Supabase admin lookup throws → company-lookup exception path (lines 93–94)

Added:
- `returns 200 with empty claims when req.text() throws`
- `returns 200 and still inserts when company lookup throws`

---

## Priority gap list (remaining)

Ordered by regression risk and ease of testing.

### P1 — `src/lib/email/notify.ts` (0% function coverage)

All email notification functions (worker MFA code, dispute notification, etc.)
are untested. They require mocking `nodemailer` / the email transport. A test
file on the pattern of `src/lib/email/welcome.test.ts` would cover them.

### P2 — `src/lib/auth/session.ts` — 64.28% function coverage

Several session-helper functions that require an authenticated Supabase context
are skipped. `requireWorkerIdentity` is tested in `session.test.ts`; the
remaining functions likely need request-scoped Supabase mocks.

### P3 — `src/app/api/verify/approve/[shiftId]/route.ts` — 54.3% branch

The approval route's error branches (shift not found, company mismatch, SMS
send failure) are not exercised. The existing 18-test suite covers the happy
path and some edge cases; adding 4–6 targeted tests would push to >80%.

### P4 — `src/app/api/command/supervisors/route.ts` — 33.3% branch

Only the happy path is covered. PATCH and DELETE handlers, and the error path
on lookup failure, are untested.

### P5 — `src/lib/wles/v1.ts` — 73.7% branch

`verifyChain` misses the GENESIS_LINK_INVALID and PREVIOUS_LINK_BROKEN paths
for v1.0 events. These are already covered in the legacy `chain-verify.test.ts`
(for v0); duplicating the test vectors for v1.0 `WlesEvent` would close the gap.

### Deferred: `src/lib/email/welcome.ts` — 66.7% function

Three functions exported; two covered. The third (`sendAdminWelcomeEmail`) is
used only in the provisioning flow that currently has no unit-test entry point.

---

## What was not covered (and why)

| Category | Rationale |
|---|---|
| Next.js page components (`page.tsx`) | These are React server/client components. Vitest doesn't run them; they'd need Playwright/Cypress for meaningful coverage. |
| `src/db/**` | Drizzle schema and migration definitions — structural, not executable logic. |
| `scripts/**` | One-shot operational scripts (seed, export simulate). Integration tested via direct execution, not unit tests. |
| `.claude/**` | Agent worktree artefacts excluded from both vitest and tsc. |
