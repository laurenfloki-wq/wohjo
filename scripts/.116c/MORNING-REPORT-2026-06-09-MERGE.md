# Substrate merge report — 2026-06-09

## Headline

- **Substrate merged.** PR #50 rebased onto `main`; new main tip
  `e8ee9f429b023e708317f78af37b69d29667c853`. 26 substrate commits
  preserved as the attestation history.
- **Post-merge gates green on main.** Both required status checks
  pass on `e8ee9f4`: `Run 7 bulletproof scenarios` (success) and
  `Real-PG full-graph attestation` (success, 10/10 ALL DIMENSIONS
  CLEAN, functions fp `e5db4aeff7b0d3ccd07c1c3650e9276a`).
- **PR #47 closed as superseded.** Closeout comment posted with the
  merge SHA. Contamination preservation re-verified on PR #49 before
  closure: 6 landing-page files all present on `feat/landing-makeover`.
- **Drift-gate Phase 4 staged.** PR #51 opens with the role SQL,
  Lauren runbook, and updated LAUREN-ACTIONS pointing at them. Code
  did not execute against production; Lauren executes, chat-Claude
  audits.
- **Paint Sweep 2+3 still staged for Lauren** to relaunch as a
  top-level Claude session in `WOHJO-paint`.

## Per-item status

| Task                                    | Status                            | Proof / artefact                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0 pre-merge re-verify                 | **Jobs**                          | HEAD on PR #50 = `3eea8c56f770e263130766957eb24e90c18758c7`; remote matched local; `git ls-tree` confirms no landing/pricing files; CI run 27191312594 on this exact SHA reported `Run 7 bulletproof scenarios` + `Real-PG full-graph attestation` both `completed/success`; local recompute of `prod-functions-def.txt` gives `e5db4aeff7b0d3ccd07c1c3650e9276a` (matches target).                     |
| 1.1 merge PR #50                        | **Jobs**                          | `gh pr merge 50 --rebase --delete-branch=false`. PR state: MERGED. mergedAt: 2026-06-09T07:47:32Z. Rebase preserved all 26 commits individually on `main`.                                                                                                                                                                                                                                              |
| 1.2 post-merge main attestation         | **Jobs**                          | Workflow run 27191733397 on `e8ee9f4`: `ALL CHECKED DIMENSIONS CLEAN`. Functions count = 11, fp = `e5db4aeff7b0d3ccd07c1c3650e9276a` ; TOTAL DELTA = 0; all 10 dimensions MATCH. Bulletproof harness on `e8ee9f4`: completed/success.                                                                                                                                                                   |
| 2.1 contamination preservation re-check | **Jobs**                          | All 6 contamination-created files confirmed present on `origin/feat/landing-makeover` with blob SHAs: `src/app/pricing/page.tsx` (64bdb55644), `src/app/v1/page.tsx` (15b0879876), `src/components/shared/LandingPageV1.tsx` (eb32538f5c), `src/components/shared/marketing/SealPlayer.tsx` (8013eaeae8), `src/remotion/SealComposition.tsx` (476cb3d096), `src/styles/landing-tokens.ts` (3fb9c9390b). |
| 2.2 close PR #47                        | **Jobs**                          | `gh pr close 47`. Closeout comment posted with merge SHA reference (`e8ee9f4`) and the preservation status of the contamination commits. Old branch `chore/116c-full-graph-bulletproof-2026-06-08` can be abandoned safely; Code did NOT delete the branch.                                                                                                                                             |
| 3.1 drift-gate role SQL                 | **Jobs (prepared, not executed)** | `scripts/.116c/drift-gate-role.sql` on branch `chore/116c-drift-gate-prep-2026-06-09` / PR #51. Tighter privilege model than the earlier draft: no SELECT on any table or view, no role membership, NOINHERIT + NOSUPERUSER + NOCREATEDB + NOCREATEROLE, default-transaction read-only. Embedded self-verify queries.                                                                                   |
| 3.2 workflow wiring                     | **Jobs**                          | `.github/workflows/drift-gate.yml` unchanged — already consumes `PGURL_PROD_READONLY` correctly and fails clean if missing.                                                                                                                                                                                                                                                                             |
| 3.3 README for Lauren                   | **Jobs**                          | `scripts/.116c/DRIFT-GATE-README.md` covers the 5-step runbook (role SQL → secret → chat-Claude audit → first run → Stage 3 promotion). Six audit queries embedded.                                                                                                                                                                                                                                     |
| 4.1 paint relaunch staged               | **Jobs (waiting on Lauren)**      | `WOHJO-paint` worktree on `paint/worker-pwa-cohesion-2026-06-07` confirmed. Sweep 1 + Sweep 2 Step 1 commits in place. `scripts/capture-field.mjs` ready. Top-level Claude session relaunch needed (subagent sandbox refuses the worktree).                                                                                                                                                             |

## Substrate state on `main`

```
e8ee9f4 docs(116c): substrate sealed — ledger + report reflect 10/10 close   ← new tip
01d7844 chore(116c): line-ending-immune normalisation on body-rendering dims
611096f docs(116c): continuation report 3 — clean-branch state, functions still needs chat-Claude
53ddcce chore(116c): refresh prod-functions-def.txt — count_broken_chain_links matches target
9b6bb51 fix(116c): byte-match count_broken_chain_links body to production
3ae2355 docs(116c): proposal — SECURITY DEFINER search_path lock (post-#47)
5f2c414 docs(116c): morning report — continuation update for 2026-06-09 evening
a2462b6 docs(116c): PR body — reflect functions swap + decisions resolved/open
0597d31 chore(116c): seal rebuild side of functions dim + shippable-readiness ledger
4a9cbf8 fix(116c): functions-dim divergence — drop current_user_company_id, add count_broken_chain_links
7c38e91 docs(116c): per-function md5 table — pinpoint functions-dim divergence
c59b4e8 docs(116c): overnight dispatch morning report 2026-06-09
5aca14b chore(116c): commit PR body + branch-protection promotion script
328b228 docs(116c): full-graph attestation hand-off for chat-Claude verification
c3ed143 chore(116c): pin prod-*/rebuild-*.txt to LF for harness stability
9cc230e chore(116c): commit policies/functions/view_body references from green CI
1137d44 fix(116c): represent dashboard drift — drop 17 rls_core_multi_tenant legacies
2da6f27 chore(116c): always upload artefacts + per-table policy breakdown in harness
2760279 docs(116c): document 5th archive entry — append_sms_code_if_absent
81be665 fix(116c): archive 202604301700_atomic_sms_idempotency — 5th deadweight Group P
b455f71 fix(116c): install extensions in `extensions` schema, not `public`
ede63ac fix(116c): newline normalisation + supabase_vault positive assertion
479a4b6 fix(116c): revert CI image to postgres:17
a494356 fix(116c): drift-gate uses pg_catalog only
6d90881 docs(116c): Lauren-actions roadmap
c79fa15 feat(116c): supabase/postgres image, drift gate scaffolding
d944b10 feat(116c): full-graph attestation harness + CI workflow
12c313a chore(116b): final attestation — all four fingerprints match production   ← pre-merge tip
```

## Post-merge attestation on `main`

Workflow run 27191733397 on `e8ee9f4`:

```
=== Dimension fingerprints ===
functions                 11   e5db4aeff7b0d3ccd07c1c3650e9276a
TOTAL DELTA: 0
rls_state: MATCH (25 lines)
policies: MATCH (43 lines)
indexes: MATCH (97 lines)
functions: MATCH (11 lines)
triggers: MATCH (9 lines)
defaults: MATCH (77 lines)
generated_columns: MATCH (1 lines)
view_body: MATCH (1 lines)
extensions: MATCH (4 lines)
zero_asserts: MATCH (3 lines)
ALL CHECKED DIMENSIONS CLEAN
```

## DECISIONS NEEDED

1. **Merge PR #51** (drift-gate prep) — substrate-only docs + SQL,
   nothing executes against production. Required for Lauren to access
   the role SQL + README.
2. **Run the drift-gate role SQL** against production per
   `scripts/.116c/DRIFT-GATE-README.md` step 1, then
   provision `PGURL_PROD_READONLY` (step 2).
3. **chat-Claude privilege audit** of `drift_gate_ro` per the six
   queries in the README. Confirm zero table grants + zero memberships
   before flipping the gate live.
4. **Stage 3 branch protection promotion** — after two consecutive
   green hourly runs, Code promotes `Compare live prod vs committed
rebuild references` to required on `main` (with Lauren's go-ahead).
5. **Relaunch paint Sweep 2+3** as a top-level Claude session in
   `C:\Users\PC\WOHJO-paint`.
6. **Post-merge forward migrations** (no rush, both proposed):
   - SECURITY-DEFINER search_path hardening — proposal at
     `scripts/.116c/PROPOSAL-security-definer-search-path-lock.md`.
   - Optional CRLF retirement on `admins_set_updated_at.prosrc` —
     the line-ending-immune normalisation makes it non-load-bearing.

## What I did NOT do (guardrail compliance)

- Did not write to production.
- Did not provision the `PGURL_PROD_READONLY` secret.
- Did not delete the old `chore/116c-full-graph-bulletproof-2026-06-08`
  branch (deferred to Lauren after the abandonment decision).
- Did not promote Stage 3 branch protection (waits on two consecutive
  green drift-gate runs + Lauren's go-ahead).
- Did not touch the paint worktree from this substrate session.

## All four authorised items — confirmation

- Merge of PR #50 — **DONE** (merge SHA `e8ee9f4`).
- Closure of PR #47 — **DONE** (closeout comment posted; pointer to
  merge SHA included).
- Drift-gate role prep — **DONE** (PR #51 open; SQL + README + updated
  LAUREN-ACTIONS).
- Paint Sweep 2+3 — **staged, waiting on Lauren relaunch** as
  top-level Claude session in `WOHJO-paint`.
