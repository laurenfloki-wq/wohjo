# Gate status — security remediation pass, 2026-06-10

Scope: forensic-audit backlog (findings A, B-i, B-ii, C, D) + console settings + attestation refs.

Suite-level proof (local, full tree):
- `tsc --noEmit` → EXIT 0
- `eslint .` → 0 errors
- `vitest run` → 1530 passed · 4 skipped · 0 failed (plus 6 new durable-limiter tests, 4 new XFF tests)

| Item | Status |
|---|---|
| A — dead requireCommandAuth path | ✅ CLOSED (PR #52 merged) |
| B(i) — XFF last-hop fix | ✅ CLOSED (PR #53 merged) |
| B(ii) — durable rate limiting | ✅ CLOSED (PR #54 merged; migration live) |
| C — service-role confinement | 🟡 CHECKPOINT (PR #57 merged: chokepoint + warn guard; 45 routes pending) |
| D — RLS admin-select backstop | ✅ CLOSED (PR #55 merged; migration live) |
| Attestation refs regen | ✅ CLOSED (PR #56 merged; Real-PG attestation green) |
| Supabase min pw length 12 | ✅ DONE (console, verified) |
| Supabase HIBP protection | 🟡 BLOCKED — Pro-plan-gated (Free org); Lauren decision |
| GitHub 2FA (laurenfloki-wq) | 🟡 TEED UP — sudo gate reached; Lauren completes TOTP (GitHub deadline 2026-07-04) |
| Vercel COMMAND_API_KEY | ✅ N/A — confirmed absent (full env list reviewed) |

Known-red on main (PRE-EXISTING, not introduced by this pass):
- "Compare live prod vs committed rebuild references" — requires PGURL_PROD_READONLY secret
  (scripts/.116c/LAUREN-ACTIONS.md action 2). Fails on every commit until provisioned.
- "Run 12-test smoke suite" — depends on VERCEL_PREVIEW_URL repository secret wiring.

Substrate advisor (2026-06-10, post-migrations):
- security: 1 WARN (auth_leaked_password_protection — plan-gated, see above) + 1 INFO
  (rls_enabled_no_policy on rate_limit_buckets — intentional service-role-only design)
- performance: unused-index INFOs only (pre-launch, expected)
- NO new RLS gaps introduced.

SECURITY REMEDIATION PASS STATUS: A, B(i), B(ii), D CLOSED · C AT CLEAN CHECKPOINT · E1 PARTIAL (two Lauren-gated items)
