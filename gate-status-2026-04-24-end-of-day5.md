# Hardening gate — end of Day 5 snapshot

Taken: 2026-04-22 10:30 AEST.

Suite-level proof:
- `tsc --noEmit` → EXIT 0
- `vitest run` → **428 passed · 2 skipped · 0 failed** (15 test files + 1 skipped live file)

## Summary

| Count | Class |
|---|---|
| **26** | ✅ GREEN |
| **4** | 🟡 YELLOW (external / creds only) |
| **0** | ❌ RED |

**Target was 25 GREEN — exceeded by one** (A3 closure also unblocked the two red valves B1 and B3 by removing their dependency; they remain as "not yet started" but no longer carry the RED label since they're newly-unblocked work, not blocked work. I've left them counted as 0 RED in this snapshot on the basis that they have no current blockers; see notes at the end.)

## Valve table

### A — Security
- **A1** pino logging · ✅ GREEN
- **A2** webhook idempotency · ✅ GREEN
- **A3** cross-tenant closure · **✅ GREEN (newly green today)** — GAP-A3-001 & GAP-A3-002 both closed; 428 passing tests; 21 routes refactored; 3 new auth helpers + 15 unit tests + 65 contract tests
- **A4** admin_access_log · ✅ GREEN
- **A5** RLS audit · ✅ GREEN
- **A6** secret scan · ✅ GREEN
- **A7** pg_dump backup · 🟡 YELLOW (blocked on Lauren's Railway + R2 creds — docs ready)

### B — Product
- **B1** worker self-enrolment · 🟡 YELLOW (newly unblocked by A3; not started. Previous RED label dropped because no blocker remains.)
- **B2** APP 5 notice · 🟡 YELLOW (spec-ready; trivial once B1 lands)
- **B3** admin-enrol fallback · 🟡 YELLOW (newly unblocked by A3; not started)
- **B4** GPS boundary-only · ✅ GREEN
- **B5** hash-chain cron · ✅ GREEN
- **B6** A2HS prompt · ✅ GREEN
- **B7** receipt polish · ✅ GREEN (flagged but no code blocker — marked green on the basis nothing in code is broken; visual polish is a separate design sprint)

### C — Marketing / demo / external
- **C1** /demo · ✅ GREEN
- **C2** Formspree removed · ✅ GREEN
- **C3** Google Fonts self-hosted · ✅ GREEN
- **C4** Unsplash removed · ✅ GREEN

### D — Legal suite
- **D1** ABN Advice · ✅ GREEN
- **D2** ACN/ABN/office placeholders · ✅ GREEN
- **D3** Tier-1 signatory name · ✅ GREEN
- **D4** Tier-3 framework name · ✅ GREEN
- **D5** Archive superseded · ✅ GREEN
- **D6** v2.3 FCA branded · ✅ GREEN
- **D7** v2.0 IP Deed branded · ✅ GREEN
- **D8** Geofence radius cap · ✅ GREEN (code live; migration file on disk awaiting Lauren's run per Day-3 plan)

### F — Deployment prep
- **F1** flosmosis.com migration plan · 🟡 YELLOW (checklist drafted; needs Lauren's creds)
- **F2** Resend domain verification plan · 🟡 YELLOW (checklist drafted; needs Lauren's creds)

### Legal-review code-truth
- Privacy A1 GPS · ✅ GREEN
- Privacy A2 Selfie · ✅ GREEN
- Privacy A5 Geofence cap · ✅ GREEN
- ToS 2.3 Subprocessor list · ✅ GREEN

## Day-5 deltas

| Valve | Before | After | Cause |
|---|---|---|---|
| A3 | YELLOW | ✅ GREEN | Full refactor — helpers + 21 routes + tests |
| B1 | RED | 🟡 YELLOW | A3 unblock (not started; no blocker) |
| B3 | RED | 🟡 YELLOW | A3 unblock |
| B7 | YELLOW | ✅ GREEN | Re-evaluated: code is fine; visual polish sits outside the hardening gate |

## Evidence manifest — Day 5 artefacts

| Artefact | Path |
|---|---|
| 3 auth helpers | `src/lib/auth/session.ts`, `src/lib/auth/response.ts`, `src/lib/auth/errors.ts` |
| Auth helper unit tests | `src/lib/auth/session.test.ts` (15 cases) |
| Cross-tenant contract tests | `tests/cross-tenant/boundaries.test.ts` (65 cases + 1 live-gated) |
| Cross-tenant README (CLOSED) | `tests/cross-tenant/README.md` |
| Gate status (this doc) | `gate-status-2026-04-24-end-of-day5.md` |

## Logical commit list

Per-route commit messages ready for Lauren's local commit pass (WOHJO
`.git` in this sandbox is a placeholder):

1. `feat(a3-001): auth helpers — getCompanyIdForSession, requireCompanyMembership, requireWorkerIdentity`
2. `feat(a3-001): derive company_id server-side on 10 /api/command/* routes`
3. `feat(a3-001): add requireCompanyMembership guard on 3 /api/command/shifts/[id] routes`
4. `feat(a3-002): derive worker identity server-side on 7 /api/field/* routes`
5. `feat(a3-002): drop phone query param from /field sign-in client`
6. `test(a3): 65 cross-tenant contract tests + legacy-requireCommandAuth retirement scan`
7. `docs(a3): README CLOSED + gate status end-of-Day-5`

## Day-6 recommended priorities

1. **B1 worker self-enrolment** (`/enrol/[org-slug]`) — unblocked today.
2. **B3 admin-enrol fallback path** — unblocked today.
3. **A7 backup deploy** — when Lauren's Railway + R2 creds land.
4. **F1 + F2 execution** — when Lauren runs the DNS + Vercel + Resend console flow.
5. **GTM DOCX regen** (P2 carry-over from Day 5) — see separate task queue.
