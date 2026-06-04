# FLOS-DL-AUTO-001 — Dispatch Decision Log (autonomous)

Date: 2026-06-04 · Branch: claude/blissful-mccarthy-ec2Wb · Executor: Claude Code

Ordered for fast backwards review. Each entry: decision, rationale, rollback.
Entries D-1, D-2, D-4 are the credentialed/outstanding actions Lauren must
authorise or run; D-3, D-5, D-6, D-7 are completed and committed.

---

## D-1 — Production WLES flag flip + forward bridge: HELD, not faked

**Decision.** Did NOT flip `WLES_V1_ENABLED` and did NOT write a bridge event
into the live chain.
**Rationale.** This environment has no Vercel credential, so the prod env var
cannot be set from here. The bridge must anchor to the v1 tip created _after_
the flip, so it cannot correctly precede it. Hand-writing a raw INSERT into
the append-only forensic chain to simulate the cutover would bypass the
validated code path and risk permanent corruption — prohibited by the
forward-only guardrail. Logged and continued, per the dispatch's own "if no
credential is present, log the exact command and continue" rule.
**Exact unblock (run where a Vercel credential exists):**

```
# 1. Set the production flag
vercel link            # select the wohjo project (do NOT rename the repo)
printf 'true' | vercel env add WLES_V1_ENABLED production
# 2. Redeploy so functions pick up the new env binding
vercel deploy --prod
# 3. Verify V0 unchanged, then emit the forward bridge through the REAL path
#    (per-actor, anchored to the current v0 tail; never rewrite v0).
#    Use buildSpecVersionMigration -> sealEvent -> insertV1Event with the
#    service-role client, OR the first real shift event after the flip.
```

**Verify after (live SQL):**

```
select spec_version, count(*) from shift_events group by 1;          -- expect a '1.0' row
select count(*) from shift_events
  where wles_event is not null and spec_version='1.0';               -- > 0
```

**Rollback.** `vercel env rm WLES_V1_ENABLED production` then redeploy. v0
path resumes (fail-closed). The v1 bridge + any v1 events remain as an intact,
separate, forward-only chain — v0 is never touched, so rollback is clean.

## D-2 — Supabase leaked-password protection: HELD (no Management API)

**Decision.** Did not enable it. Advisors currently 0 ERROR, 1 WARN.
**Rationale.** It is a GoTrue auth-config setting, not a DB row; the MCP tools
present expose SQL/migrations/branches/advisors only, and no Management API
token is in this environment.
**Exact unblock (dashboard):** Authentication -> Sign In / Providers ->
Password -> enable "Leaked password protection (HaveIBeenPwned)".
**Exact unblock (API):**

```
curl -X PATCH https://api.supabase.com/v1/projects/rwnxnnudljpgyfwbnosu/config/auth \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"password_hibp_enabled": true}'
```

**Verify after:** re-run the security advisor; the WARN clears.
**Rollback.** Set `password_hibp_enabled` back to false (affects only new
password set/reset; no existing user is locked out either way).

## D-3 — SCA HIGH remediation: next 16.2.3 -> 16.2.7 (DONE, committed 48e373e)

**Decision.** Bumped Next.js to the patched in-minor release.
**Rationale.** Cleared the one HIGH npm-audit finding (Next.js CVE batch) plus
the bundled postcss moderate, non-breaking. Confirmed standard npm Next.js
(not a fork; AGENTS.md warns about Next _16_ breaking changes vs old training).
**Evidence.** Post-fix audit 0 high / 0 critical; full suite 1505 passed / 0
failed. Three residual moderates are one upstream postcss XSS inside
next/@serwist, `fixAvailable: false` — tracked for the next upstream release.
**Rollback.** `git revert 48e373e` restores 16.2.3 (reintroduces the HIGH).

## D-4 — Jobs Standard UX lift: SCOPED, not attempted blind (OUTSTANDING)

**Decision.** Did not perform the full worker-app / admin-dashboard UX lift.
**Rationale.** It needs a running app plus visual and accessibility review;
this headless environment has no runtime env to boot the app, and spraying
unverifiable CSS/markup changes into a live field app risks regressions worse
than the gap. The responsible path is a reviewed, runnable iteration.
**Forward plan.** Audit each worker state (sign-in, clock-on/off, approval,
error, offline/poor-signal) and admin flows (bulk upload, one-click export)
against the Jobs Standard; implement against a runnable preview; capture
before/after and an accessibility pass (contrast, target size, SR labels).
**Rollback.** N/A (no change made).

## D-5 — Real-path E2E + independent verification (DONE, committed 3dc511a)

**Decision.** Added `src/test/integration/wles-v1-e2e.test.ts` and produced an
export verified by the independent verifier.
**Rationale.** Proves the integrity-bearing layer of Phase 4 without the
production runtime. Caught and fixed a build-breaking type error
(`approval_method: 'web_link'` -> `'web'`) before it could land.
**Evidence.** 6/6 test; `gate-reports/wles-v1-activation-2026-06-04/`
(`e2e-export-SIMULATED.json`, `independent-verifier-output.json` = pass, 5
events, 0 failures). **Rollback.** `git revert 3dc511a`.

## D-6 — Live full-table chain integrity check (DONE, read-only)

**Decision.** Verified all 32 live v0 events. **Evidence.** 0 missing hashes,
0 duplicates, 5 genesis, 0 broken links, 0 fork points. **Rollback.** N/A.

## D-7 — Did not contact any customer; did not rename repo; no retired brands

**Decision.** Honoured all hard constraints. No emails/onboarding (Mo/Joao/
Dass untouched); repo name + Vercel integration untouched; no retired brand
name introduced into product-facing artefacts; no emojis. **Rollback.** N/A.
