# Tier-0 / Ship-Gate pass — gate report, 2026-06-10 (late pass)

Scope: best-in-class programme Tier 0 (0.1, 0.3, 0.4, 0.6) + Ship-Gate CP-1 slice 1.
Executor: Cowork Claude. Verification spine: chat-Claude (read-only on production).

## PRs (all merged to main)
1. #62 — CI "Unit suite" (typecheck + lint + full vitest on clean npm ci) — Tier 0.6
2. #63 — MFA issue/challenge onto checkRateLimitDurable + 3 cross-instance tests — Tier 0.1
3. #64 — Supabase Root 2021 CA pinned for drift-gate TLS — Tier 0.3
4. #66 — workers repository slice 1 (3 routes off the raw service client) — CP-1 / SG-2

## Reweighting note 1 — pre-0.6 "green" excluded CI-run tests
Until PR #62 (2026-06-09 22:34 UTC), NO CI job executed typecheck, lint, or the vitest
suite. Every earlier "all checks green" statement (PRs #52–#61) covered the bulletproof
scenarios, attestation, and Vercel build only; the gate's test step ran locally where it
ran at all. Earlier green therefore bears less weight than it appeared to. From #62 the
unit suite is CI-enforced on every PR and main push; it demonstrated value immediately by
failing PR #66's first commit (see below).

## Reweighting note 2 — drift-gate TLS closure is closed-by-run-log
The verify-full TLS configuration lives inside the PGURL_PROD_READONLY secret, which is
not observable in source. The evidence that chain verification is active is the
dispatched run log (run 27240777836, green under sslmode=verify-full +
sslrootcert=scripts/.116c/supabase-prod-ca-2021.crt) — i.e. verified by design + run log,
not verified in source. Any future secret edit silently changes this posture; the gate
would fail loudly on connection error but NOT on a silent downgrade to weaker sslmode.
Residual recorded: consider moving sslmode/sslrootcert into the workflow definition (source-
observable) with only credentials in the secret.

## Tier 0 evidence summary
- 0.1: both MFA routes on the durable limiter at HEAD; root cause of the original miss
  named (coverage grep matched RATE_LIMITS presets; these routes use inline window
  literals). Cross-instance tests at exactly the MFA windows. Unit suite green (PR #63).
- 0.3: drift_gate_ro rolvaliduntil=2026-09-10, rolconnlimit=5 (pg_roles verified,
  privileges unchanged: zero table grants, zero memberships). TLS per note 2. Promotion
  to required check teed up — Lauren-run per promote-full-graph-required.sh protocol.
- 0.4: VERCEL_PREVIEW_URL secret set (git-main alias); dispatched smoke run 27240778839
  green 12/12. First on-push proof was the next main push. Suite expansion (auth/OTP/
  webhook assertions) still open under P-H.
- 0.6: CI unit suite is the canonical runner. Named environment facts: the Cowork synced
  mount SIGBUSes vitest when syncing under it, and npm ci must never run on the mount
  from the VM (would write Linux natives into the Windows node_modules).

## CP-1 slice 1 evidence summary (SG-2 in progress)
- workers.repo.ts: workersRepo(companyId) + workerSelfRepo(workerId); column lists
  byte-identical to prior route inlines; compound tenant predicate preserved inside
  updateMyobCardId.
- Routes migrated: command/workers, command/worker-card-ids, field/worker.
  Direct createServiceClient in route handlers: 45 → 42.
- The unit suite caught a source-string guard test asserting the compound predicate in
  the ROUTE source; per S9 the test was strengthened, not weakened: it now asserts the
  route delegates to the company-bound factory AND the repo source carries the predicate.
  Template for all future slices (more source-string substrate tests likely exist).
- Slice scope honesty: admin/import/workers, admin/workers/bulk-upload,
  field/bootstrap-worker, field/role-detect also touch other tables and migrate as those
  repos land. Exports-touching routes are all multi-table (exports+shifts+shift_events);
  the next slice is therefore shifts/shift_events, after which the export routes can
  migrate fully.

## Founder queue (tracked, not blocked)
GitHub 2FA (2026-07-04 deadline) · HIBP (plan-gated) · drift-gate promotion script run ·
drift_gate_ro expiry renewal (2026-09-10, recurring).
