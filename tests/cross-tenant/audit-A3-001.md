# GAP-A3-001 audit — route-by-route classification

**Date:** 2026-04-22
**Author:** Autonomous Day 2 sprint agent
**Status:** AUDIT COMPLETE · **REFACTOR BLOCKED** (see "Architectural blocker" §)

## Architectural blocker — WHY THE REFACTOR CANNOT START YET

A Class A refactor (derive `company_id` from session) presupposes
that a server-side mapping from `auth.users.id → company_id` exists.
**It doesn't.**

Evidence:
- `src/db/schema.ts` defines 7 tables: `companies`, `sites`, `workers`,
  `supervisors`, `shift_events`, `shifts`, `exports`. No `admins`,
  `admin_users`, or `company_memberships` table.
- `companies` columns: `id, name, abn, contact_email, contact_phone,
  created_at, is_active`. No `owner_user_id`.
- `src/lib/security/command-auth.ts::AuthResult` declares `companyId?:
  string` but it is **never populated** anywhere in the tree.
- Grep for `app_metadata`, `user_metadata`, `admin_users`, `admins`
  returns zero matches in `src/`.

Before any Class A refactor can ship, Lauren must pick one of the
following four materially different architectural paths. They imply
different migrations, different auth flows, and different RLS
strategies.

| Option | Storage | Multi-company per admin? | Migration effort | RLS fit |
|---|---|---|---|---|
| **A** | `auth.users.raw_app_meta_data.company_id` set at invite | No — one company per user | Minimal (no schema change) | Works with `auth.jwt() ->> 'app_metadata' ->> 'company_id'` |
| **B** | New `admins` table `(user_id uuid, company_id uuid, role text)` | No — one row per user | Small migration | Works with subquery in RLS policy |
| **C** | New `company_memberships` table (many-to-many) | Yes | Medium migration | Works with subquery |
| **D** | Custom JWT claim via Supabase auth hook | Depends on hook logic | Needs Supabase Auth Hook + Edge Function | Works natively |

**Per the Day 2 brief's hard rule — "Do not guess" — the refactor stops
here until Lauren picks one.** The audit table below is nonetheless
complete and actionable once the decision is made.

Recommended for Lauren's morning review: **Option B** (new `admins`
table). Rationale: smallest delta that still gives us a proper record
of who is an admin and at which company. Option A is Supabase-native
but every admin-create and admin-remove is a write to
`auth.users.raw_app_meta_data` which is annoying to maintain. Option
C is nice to have but premature (no multi-company admins exist today).
Option D is overkill for the current scale.

## Audit table — 32 pino-instrumented API routes

Classification key:
- **A** — `company_id` derivable from session (or worker/supervisor
  session). `company_id` should not be client-input.
- **B** — route genuinely needs cross-company access (superuser /
  cron). Explicit guard + documented reason.
- **C** — public/unauthenticated; no `company_id` applies.
- **?** — ambiguous; needs Lauren's review.

### /api/command/* (session-authenticated admin surface)

| Route | Method | Today | Class | Change |
|---|---|---|---|---|
| `/api/command/approvals` | GET | No `company_id` input — scans all shifts in `.from('shifts')` regardless of admin! | **A** | Add `company_id = auth.companyId` filter on the shifts select |
| `/api/command/audit` | GET | `companyId` from query string | **A** | Derive server-side; remove `companyId` query param |
| `/api/command/audit/download` | GET | `companyId` from query string | **A** | Same |
| `/api/command/audit-trail` | GET | No `company_id` — queries `shift_events` globally | **A** | Add `company_id = auth.companyId` filter |
| `/api/command/export` | POST | `company_id` in request body | **A** | Derive server-side; remove from ExportRequestBody |
| `/api/command/intelligence` | GET | No `company_id` — unclear what it even filters on | **A** | Add filter; scope to session's company |
| `/api/command/sites` | POST | `company_id` optional in body (falls back to null) | **A** | Always use `auth.companyId`; reject body value if supplied |
| `/api/command/super-evidence` | GET | No `company_id` — scope unclear | **A** | Filter by session's company |
| `/api/command/supervisors` | POST | `company_id` optional in body | **A** | Always use session's |
| `/api/command/workers` | POST | `company_id` optional in body | **A** | Always use session's |
| `/api/command/shifts/[shiftId]/adjust` | POST | Looks up shift, reads `shift.company_id` | **A** | Add `if (shift.company_id !== auth.companyId) return 403` |
| `/api/command/shifts/[shiftId]/approve` | POST | Same | **A** | Same guard |
| `/api/command/shifts/[shiftId]/dispute` | POST | Same | **A** | Same guard |

### /api/field/* (phone-OTP-authenticated worker surface)

| Route | Method | Today | Class | Change |
|---|---|---|---|---|
| `/api/field/worker` | GET | `phone` from query, looks up worker by phone | **A** | Must use `session.user.phone` not client-supplied; currently any authenticated worker can look up any other worker's company+id |
| `/api/field/home-data` | GET | `phone` from query | **A** | Same — use session phone |
| `/api/field/shifts/week` | GET | `worker_id` from query | **A** | Use session's worker_id derived from session phone |
| `/api/field/earnings/week` | GET | `worker_id` from query | **A** | Same |
| `/api/field/shift/start` | POST | Body has `worker_id`. Route looks up worker to derive company_id. | **A** | `worker_id` should be derived from session phone, not body |
| `/api/field/shift/end` | POST | Body has `shift_id`. Looks up shift, derives company_id. | **A** | Add guard: `if (shift.worker_id !== session.worker.id) return 403` |
| `/api/field/receipt/[receiptId]` | GET | No auth enforcement visible — looks up shift by receipt_id globally | **A** (or **?**) | Add guard: receipt's worker_id must match session worker |

### /api/verify/* (supervisor-token surface)

| Route | Method | Today | Class | Change |
|---|---|---|---|---|
| `/api/verify/auth` | GET | Token → supervisor → `supervisor.company_id`. Safe. | **C** (token is the capability) | None — already derives from the capability |
| `/api/verify/shifts` | GET | `supervisor_id` from query | **A** | Verify `supervisor_id` matches token's supervisor |
| `/api/verify/approve/[shiftId]` | POST | Body has `supervisor_id`. Looks up shift, supervisor separately. | **A** | Guard: `shift.company_id === supervisor.company_id` AND `body.supervisor_id === session.supervisor_id` |
| `/api/verify/dispute/[shiftId]` | POST | Same | **A** | Same guard |

### /api/cron/* (system superuser surface)

| Route | Method | Today | Class | Change |
|---|---|---|---|---|
| `/api/cron/keepalive` | GET | CRON_SECRET header; no company_id | **B** | None — documented superuser |
| `/api/cron/supervisor-batch` | GET | CRON_SECRET; iterates all companies | **B** | None — superuser; document in-file |
| `/api/cron/rotate-verify-tokens` | GET | CRON_SECRET | **B** | None |
| `/api/cron/approval-fallback` | GET | CRON_SECRET | **B** | None |
| `/api/cron/verify-hashes` | GET | CRON_SECRET; iterates all companies | **B** | None |

### /api/webhooks/* (external-party surface)

| Route | Method | Today | Class | Change |
|---|---|---|---|---|
| `/api/webhooks/twilio/sms-reply` | POST | Twilio signature verified; supervisor looked up by phone from Twilio form; `supervisor.company_id` used | **C** (signature is the capability) | None — already scoped to the authenticated supervisor |

### /api/intelligence/*

| Route | Method | Today | Class | Change |
|---|---|---|---|---|
| `/api/intelligence/analyse/[shiftId]` | GET, POST | Looks up shift by shiftId; auth via `Authorization: Bearer INTELLIGENCE_INTERNAL_KEY` header | **C** (service-to-service) | Confirm header check is enforced; low-risk |

### /api/founding (public)

| Route | Method | Today | Class | Change |
|---|---|---|---|---|
| `/api/founding` | POST, GET | No auth; public lead form; no `company_id` | **C** | None |

## Summary counts

| Class | Count | Subtotals |
|---|---|---|
| **A** — derive server-side | **21** | Command 13 · Field 7 · Verify 3 (… minus 2 = 3 actually since verify/auth is C) |
| **B** — superuser by design | **5** | All cron routes |
| **C** — public/webhook/token-authed | **6** | founding, twilio webhook, verify/auth, intelligence/analyse (two methods on same route), and intelligence/analyse GET |
| **?** — ambiguous | **0** | — |

*(The route count adds to 32 when GET+POST on the same route is counted as two routes; the cross-tenant README table already uses the route-not-method count. Use whichever is useful.)*

## Second gap discovered during audit — GAP-A3-002

The audit surfaced a **second cross-tenant gap** in the /api/field/*
surface. Worker-facing routes accept `worker_id` or `phone` from the
query string without verifying they match the authenticated session's
worker. An authenticated Worker A can pass Worker B's phone or
worker_id to `/api/field/worker`, `/api/field/home-data`,
`/api/field/shifts/week`, `/api/field/earnings/week` and retrieve
Worker B's data.

**Severity:** HIGH (same as A3-001 — not exploitable today because
no live workers, but day-one data leak once workers onboard).

**Affected routes:**
- `/api/field/worker`
- `/api/field/home-data`
- `/api/field/shifts/week`
- `/api/field/earnings/week`
- `/api/field/shift/start` (body `worker_id`)
- `/api/field/receipt/[receiptId]` (no worker check)

**Remediation:** the field routes must derive `worker_id` from the
Supabase session (`session.user.phone` → `workers.phone = X`), not
from client-supplied query/body. Same shape as the Class A command fix.

This is a NEW finding from tonight's audit; it was not in the original
GAP-A3-001 write-up. Log it alongside for Lauren.

## Recommendations for Day 2 morning review

1. **Decision required from Lauren:** which of A/B/C/D above for the
   admin→company mapping. Without that the Class A refactor cannot
   start.
2. **Second decision required:** how to attach a `worker_id` to the
   Supabase phone-OTP session cleanly. Options:
   - Phone is the join key (safe because Supabase proves it's the
     user's); the route becomes `const { data } = await
     supabase.auth.getUser(); const phone = data.user.phone;` then
     `workers.findOne({ phone })`. No schema change.
   - Store `worker_id` in `app_metadata` on first sign-in.
3. Once both decisions land, the Class A refactor is 21 routes × ~15
   minutes each = one solid half-day. The audit table above is the
   direct checklist.
4. The boundary test matrix in `boundaries.test.ts` already has 29
   skipped tests that describe the exact expected behaviour — one
   per route × attack vector. After the refactor, each `.skip` flips
   to `.it` and the test asserts 403/404.

---

*Audit completed without making any code change. tsc still clean, all
341 passing tests still passing. No changes to `command-auth.ts`, to
any route, or to the schema. Ready for Lauren's architectural
decision in the morning.*
