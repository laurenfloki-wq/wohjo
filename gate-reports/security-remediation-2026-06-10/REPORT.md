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

## Addendum — spine finding on B(ii), same day

The verification spine flagged the B(ii) close-out. Re-verified at source (2026-06-10, second pass):

- **Confirmed:** `rate_limit_buckets` had RLS enabled with ZERO policies (pg_policies count = 0).
  The original report's "intentional service-role-only design" framing relabelled a real advisor
  finding (`rls_enabled_no_policy`) as intentional — this violates the engineering standard
  (S1.5/S4) and is retracted. Fixed by migration
  `20260610120000_sec_b2b_rate_limit_buckets_service_policy.sql` (explicit
  `rate_limit_buckets_service_only` FOR ALL TO service_role). pg_policies now shows the policy;
  the advisor INFO is cleared. Security advisor after fix: only the plan-gated
  `auth_leaked_password_protection` WARN remains.
- **Not reproducible at HEAD:** "rate-limit.ts still uses the in-memory Map and never calls the
  RPC". Observed at HEAD (b8fcabb3): `src/lib/security/rate-limit-durable.ts` present (blob
  b1a6c7fb); all six AUTH/WEBHOOK preset call sites (`field/worker`, `verify/auth`,
  `verify/approve`, `verify/dispute`, `verify/shifts`, `webhooks/twilio/sms-reply`) call
  `checkRateLimitDurable`; code search confirms remaining legacy `checkRateLimit(` callers use
  EXPORT/API presets only (out of durable scope per standard S5.5); integration test
  `rate-limit-durable.test.ts` present. Status remains with the spine to confirm — this section
  records observation with pointers, not self-certified closure.
- **Runner note:** the session's local vitest runner SIGBUSed on the synced mount (environment,
  not code); no local test counts are asserted for this PR — CI is the test evidence.

## Standing-backlog verification pass — 2026-06-10 (second pass, items 3/4/5)

**Item 4 — audit-log IP fields (confirmation backing the "very low" rating).** Verified in all
five modules (`auth/events/hook`, `field/bootstrap-worker`, `worker/mfa/challenge`,
`worker/mfa/issue` via issueChallenge, `worker/records/export`, plus `lib/auth/auth-events-emit`):
the leftmost-XFF value flows ONLY into INSERT payloads on audit tables (`auth_events`,
`worker_mfa_challenges`, `worker_record_exports`, `worker_sign_in_log`). The one downstream
consumer beyond plain audit (`lib/auth/worker-signin-anomaly.ts`) stores the value (line 227)
and raises informational, non-blocking flags computed from other fields — the IP itself is not
referenced in any comparison, key derivation, or authorisation decision. Rating "very low"
stands, now with the verification it was conditioned on.

**Item 3 — console settings, observed state (not intended state).**
- Supabase leaked-password (HIBP): provider panel states "available on Pro plan and above";
  org badge shows FREE (observed in dashboard, 2026-06-10). Cannot be enabled at current plan.
  Open residual, rating LOW (admin-only password surface; 12+ char minimum in force).
- Supabase minimum password length: input shows 12 after save + reload (observed).
- GitHub 2FA on laurenfloki-wq: API `two_factor_authentication: false` as of 2026-06-09 22:03 UTC
  — enrolment teed up at the sudo gate, NOT done; remains with the founder (GitHub deadline
  2026-07-04). Explicitly not marked Done per the console/setting Definition of Done.

**Item 5 — drift-gate live-prod credential, provisioned.**
- Role `drift_gate_ro` created on the substrate per `scripts/.116c/drift-gate-role.sql`:
  LOGIN, nosuperuser/nocreatedb/nocreaterole/noinherit; CONNECT + USAGE only;
  `default_transaction_read_only = on`. Self-verification queries returned the expected
  zero rows for both table grants and role memberships.
- GitHub Actions secret `PGURL_PROD_READONLY` set (metadata-verified present, created
  2026-06-09T22:04Z). Credential recorded in WOHJO_credentials.txt (now gitignored — it was
  previously untracked but NOT ignored; fixed in this PR).
- Per the role script: the spine should audit the role's effective privileges before the
  comparison gate is treated as live, and promotion to a required status check waits for
  Lauren's explicit go-ahead. Neither is done here.

**Item 1 status pointer:** see the addendum above and PR #59 — policy fixed + advisor clear;
wiring observed live at HEAD; closure remains with the spine.
