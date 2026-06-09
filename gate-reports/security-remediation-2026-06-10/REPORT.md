# Security remediation gate report — 2026-06-10

Origin: forensic audit (read-only live substrate + full 562-file source read).
Executor: Cowork Claude. Independent verification spine: chat-Claude (read-only on prod).

## PRs (all merged to main, in order)
1. #52 — A: remove dead requireCommandAuth path + ESLint api-key-principal guard
2. #53 — B(i): getClientIP last-XFF-hop fix + spoof-rotation tests
3. #54 — B(ii): durable Postgres-backed rate limiting (AUTH + WEBHOOK presets)
4. #55 — D: RLS admin-of-company SELECT backstop on six no-browser-read tables
5. #56 — attestation reference regeneration (5 dimensions)
6. #57 — C PR 1/N: service-role chokepoint + warn-mode route import guard

## Supabase security advisor

BEFORE (2026-06-10, pre-migrations):
- WARN auth_leaked_password_protection (only finding)

AFTER (2026-06-10, post-migrations + console pass):
- WARN auth_leaked_password_protection — UNCHANGED. Enabling is Pro-plan-gated; org is on
  Free. Min password length raised 6→12 in the same panel (saved, re-verified). Decision
  with Lauren: upgrade plan to clear, or accept.
- INFO rls_enabled_no_policy on public.rate_limit_buckets — INTENTIONAL: service-role-only
  table (RLS enabled, zero policies = anon/authenticated denied; service role bypasses).
- No other findings. No new RLS gaps.

Performance advisor: unused-index INFOs only (pre-launch traffic; expected; no action).

## Substrate state verification (pg_policies, 2026-06-10)
- workers, shifts, sites, exports, supervisors, shift_events: `*_admin_select` (authenticated,
  via public.admins membership) + service_role_full_access — as intended.
- geofence_events: authenticated_select_own_company UNCHANGED (browser-client load-bearing).
- rate_limit_buckets: RLS enabled, no policies; check_rate_limit() smoke-tested
  (allowed:true/remaining:2), smoke row deleted; EXECUTE revoked from public/anon/authenticated.

## Route-test results
- Full suite: 1530 passed / 4 skipped / 0 failed (pre-PR baseline re-run per change)
- New: rate-limit-durable.test.ts 6/6 (incl. cross-instance shared-DB denial property)
- security.test.ts: 81/81 with last-hop XFF semantics + spoof-rotation proof
- tests/schema-drift battery + field routes after D: 58/58

## CI gate on main after merges
- Run 7 bulletproof scenarios: SUCCESS
- Real-PG full-graph attestation: SUCCESS (after #56; one set-equality artefact found and
  fixed — loadRef() whole-file trim eats a trailing space on the final line; the file now
  keeps a non-whitespace-terminated line last)
- Compare live prod vs committed rebuild refs: PRE-EXISTING RED — PGURL_PROD_READONLY
  secret not provisioned (LAUREN-ACTIONS.md action 2). Not introduced by this pass.
- 12-test smoke suite: PRE-EXISTING RED — VERCEL_PREVIEW_URL secret wiring pending.

## createServiceClient direct calls in route handlers (finding C tracker)
- 2026-06-10: 45 direct call sites remain (unchanged — PR 1/N adds the chokepoint and the
  warn-mode guard only). Flip guard to error when count reaches zero.

## Behaviour preservation
No user-facing behaviour change in any merged PR: dead-code removal (A), rate-limit keying
(B-i), additive durable backstop with fail-open (B-ii), unused-policy-surface removal (D),
additive module + lint config (C PR1), reference files only (#56).
