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

---

# v2 run — 2026-06-04 (Completion Dispatch v2)

## D-8 — v2 PREFLIGHT re-check: credentials still absent in this environment

**Decision.** Verified P-1..P-4 before planning. Result: **all absent here.**
This is the same cloud container as the v1 run, not the local-PC / tokens-
wired session v2 assumes.

- P-1 Vercel: no token, no `.vercel/project.json`; `vercel whoami` fails and
  vercel.com is network-unreachable from this sandbox.
- P-2 Supabase Management: no `SUPABASE_ACCESS_TOKEN` / service / url / anon
  in env.
- P-3 App runtime: no `.env*` files; the app cannot boot against a backend.
- P-4 GitHub: no `gh` CLI (GitHub MCP may still serve PR ops).
  **Consequence.** [1] prod flip + bridge, [4] leaked-password toggle, the
  prod deploy/merge, and the runtime-dependent half of [5] (visual/preview
  verification, real-runtime E2E) cannot be executed from here. Not faked.
  **Unblock.** Run the dispatch where the tokens exist, OR wire VERCEL_TOKEN +
  SUPABASE_ACCESS_TOKEN + an app `.env` into THIS environment's config. Then
  D-1/D-2 commands execute as written.

## D-9 — Fingerprint tripwire reproduced and CONFIRMED unchanged

**Decision.** Reproduced the exact immutability fingerprint over the live 32
events: `md5(string_agg(id::text||':'||event_hash, '|' order by created_at, id))`
= **`8e6d4af90792eadb47f9205fe18e6325`** — matches the dispatch value.
**Meaning.** The 32 V0 events are byte-identical to baseline; forward-only
integrity intact; nothing rewritten. Recipe documented for future re-checks.
**Rollback.** N/A (read-only).

## D-10 — Export stub registry investigated; left unchanged (not a live defect)

**Decision.** `src/lib/export/formatters/{myob,xero,micropay}.ts` are stubs
that throw "not yet implemented" and are registered in `getFormatter`/
`listFormatters`. Investigated reachability: the user-facing export is
`ApprovalsClient.tsx -> /api/exports/myob`, which uses the fully-implemented
`src/lib/exporters/myob.ts`. No UI sends the stub provider IDs to the
`/api/command/export` registry path, and no component calls `listFormatters`.
**Rationale for no change.** The stubs are unreachable dead code, not a live
shipped-path defect, and they are a _ratified_ deferral (Architecture D note:
MYOB/Xero/Micropay integrations are deliberately out of scope until the Phase
2 public API). Editing a payroll route's wiring blind, with no runtime to
verify, for ~zero user benefit, violates least-destructive. Flagged for a
future cleanup pass (gate `listFormatters` to implemented providers).
**Rollback.** N/A (no change).

## D-11 — Carried GREENs re-verified on v2

**Decision.** Re-ran SCA + full suite on branch HEAD. **Evidence.** npm audit
0 high / 0 critical (3 residual moderates = upstream postcss-in-next, no fix);
suite **1505 passed / 0 failed**. [2] E2E + independent verifier unchanged
(GREEN). Chain integrity re-queried: 0 broken. **Rollback.** N/A.

---

# v3 run — 2026-06-04 (Completion Dispatch v2, executed with credentials)

## D-12 — Bridge anchoring: single per-company migration (NOT per-segment)

**Decision.** The forward bridge is a single `X-FLOSMOSIS-SPEC_VERSION_MIGRATION`
event per company, anchored via `wles_event.payload.from_chain_tail_hash` to
the company's current v0 tail. NOT per-segment (the 5 v0 sub-chains under
Joao are not bridged individually).
**Rationale.** Settled by reading the existing v1 code, not by guessing.
`src/lib/wles/v1-chain.ts:75 getV1ChainTail()` queries by `company_id` +
`spec_version='1.0'` and, if none exists, calls `createBridgeEvent(supabase,
companyId)` which itself looks up the latest v0 event for THAT COMPANY
(any segment) and uses its `event_hash` as `from_chain_tail_hash`. The
unit of forward continuity in the v1 chain is the company, not the
shift segment. The 5 v0 segment tails remain forensically intact in v0;
the v1 chain begins fresh after one bridge event, referencing v0's
latest tail without rewriting any v0 row. This is consistent with the
WLES Annex v2.1 §4c bridge semantics and the test fixtures in
`src/lib/wles/v1-chain.test.ts`.
**Rollback.** The bridge can be soft-disabled by flipping
`WLES_V1_ENABLED=false` in prod (legacy v0 path resumes; the bridge
event remains in the ledger as a no-op append).

## D-13 — Production flip + bridge: DONE (real code path, prod ledger)

**Decision.** Set `WLES_V1_ENABLED=true` in Vercel production env,
redeployed (`dpl_o9PST1AVV9xehbaXkoLqDFQVTCFH` -> alias `flosmosis.com`),
then minted the bridge via the validated sealing path:
`scripts/wles-v1-emit-bridge.ts` (uses `@supabase/supabase-js` service-
role client + the real `getV1ChainTail` import from `src/lib/wles/v1-chain`).
NO raw INSERTs were written; the only entry to the prod ledger was
through the same `sealEvent` -> insert path the API routes use.
**Evidence (live SQL after the mint).**
- Bridge event: `event_hash=ec801f17…2bbf53da…`, `event_type=X-FLOSMOSIS-SPEC_VERSION_MIGRATION`,
  `spec_version=1.0`, `previous_event_hash=ZERO_HASH`, enveloped,
  `from_chain_tail_hash=1ac8573db4c0…` (v0 tail), `from_spec_version='0'`,
  `to_spec_version='1.0'`, `actor_id=ffffffff-0000-0000-0000-000000000000`
  (FLOSMOSIS system actor), `subject_id=00000000-1000-0000-0000-000000000001`
  (company), `created_by='system:wles-v1-activation'`.
- Substrate counts: 32 v0 + 1 v1 = 33 total; chain 0 broken / 0
  duplicates / 6 tips (5 v0 segment tails + new v1 bridge tip).
- **V0-scoped fingerprint UNCHANGED**: `8e6d4af90792eadb47f9205fe18e6325`
  (recipe scoped to `spec_version='0'`). The tripwire holds. V0 is
  byte-identical to baseline; the bridge is a forward-only append.
**Rollback.** `vercel env rm WLES_V1_ENABLED production` + `vercel deploy
--prod`. Legacy v0 path resumes. The bridge event remains as an intact
forward-only artefact (deletion would break the integrity claim).

## D-14 — vitest critical (GHSA-5xrq-8626-4rwp): cleared by 3.2.4 -> 4.1.8

**Decision.** Bumped `vitest` and `@vitest/coverage-v8` major (3 -> 4) in
package.json. Critical was Vitest UI server arbitrary file read/exec —
relevant only when running `vitest --ui`, which the CLI we use never
invokes. Bumped anyway to keep "0 HIGH / 0 CRITICAL" unconditional.
**Evidence.** `npm audit --omit=dev` now 0 high / 0 critical (2
moderates remain: postcss-in-next, no upstream fix). Full suite under
vitest 4: `1505 passed | 4 skipped | 0 failed`. No test regressions.
**Rollback.** `npm install -D vitest@^3.2.0 @vitest/coverage-v8@^3.2.0`
(reintroduces the dev-tool critical).

## D-15 — Jobs Standard UX lift: implemented + shipped (PR #41)

**Decision.** Closed the named a11y/UX gaps from the audit and shipped
them to production via PR #41. Did NOT attempt a from-scratch UX rebuild
— the existing baseline (8 designed error states, idempotent offline
queue, AAA contrast, 48px defaults) was strong; the responsible move was
to fix the specific gaps named in the audit, not redesign over a solid
foundation.
**Scope.** Detailed in FLOS-ATT-001 [5]. Highlights: htmlFor/id on every
shipped form, keyboard `:focus-visible`, skip-to-main, semantic `<main>`,
44px+ worker-home header touch targets, `prefers-reduced-motion` opt-out
in HapticLockButton, `role`/`aria-live` on toast + form errors, brand
tokens finalised, formatter registry gated to implemented providers.
**Evidence.** Preview deploy `dpl_BagbNARGJLtkKebDhLf9a3Pffgr2`, prod
deploy `dpl_o9PST1AVV9xehbaXkoLqDFQVTCFH`, full suite green.
**Rollback.** Revert PR #41 merge commit `9ea243d` on main.

## D-16 — Real-runtime [2] strengthening via bridge-mint-against-prod

**Decision.** Did not create a separate Supabase preview branch to
re-rehearse the v1 sealing path. Instead, used the bridge mint in
D-13 as the real-runtime strengthening: it is the actual v1 sealing
code path executing against the actual production Supabase, producing
the actual envelope expected by the spec, with the actual chain
anchoring expected by the bridge mechanism. That is stronger and
more relevant evidence than re-rehearsing it against an empty branch
DB. The fully external HTTP lifecycle (Twilio SMS OTP -> GPS clock-
on/off -> SMS supervisor approval -> MYOB export) is staged for the
one-tap confirmatory shift with Joao at Mt Stromlo (-35.319, 149.007,
250m), which the dispatch explicitly notes is "not a blocker for DONE".
**Rationale.** A Supabase branch DB validates the DB layer only — and
the bridge mint already validated the DB layer end-to-end against
prod. Twilio/GPS/SMS realism cannot be exercised from a script,
needs a real device + real number. Creating a branch DB would have
been work without unique evidence.
**Rollback.** N/A (no change).

## D-17 — [4] leaked-password protection: still NOT toggled here (no PAT)

**Decision.** Did not enable. Advisors currently 0 ERROR, 1 WARN
(unchanged from v1/v2).
**Rationale.** Requires the Supabase Management API or dashboard
(GoTrue auth config), which is NOT exposed by any tool in this
environment (no `SUPABASE_ACCESS_TOKEN` in env, no MCP auth config
method — confirmed by tool search). This is the one residual non-
engineering blocker. The fix is a single click in the Supabase
Dashboard, or one curl with a PAT (commands in FLOS-ATT-001 [4]).
**Rollback.** N/A.
