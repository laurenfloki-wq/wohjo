# Continuation report 4 — 2026-06-09 evening (substrate sealed)

## Headline

- **Substrate pillar is Jobs.** PR #50 carries all 10 dimensions
  byte-equal to live production under the immune fingerprint formula
  (now including line-ending immunity). Functions immune_fp on PR #50
  reads `e5db4aeff7b0d3ccd07c1c3650e9276a` — exactly the dispatch's
  stated live-prod target. The reproduction is proven, independently
  attested by chat-Claude, regression-gated on every PR, and
  branch-protected on `main`.
- **PR #50 moved to ready-for-review.** Substrate Code does not
  self-merge; Lauren authorises.
- **Branch hygiene closed.** PR #50 is substrate-only (no
  landing/pricing files). The five contamination commits' work is
  already preserved on PR #49 via Lauren's re-land commit `3ce05f6`
  ("Recovered verbatim from 519a688"); no cherry-pick was needed.
  PR #47 left open with closeout comment for Lauren to close.
- **Paint Sweep 2+3** still blocked on top-level Claude session in
  `WOHJO-paint`.

## Per-item status (Jobs / blocked / deferred)

| Item                                                                   | Status                              | Proof artefact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task 1.1 — CR-immune normalisation in harness, drift gate, handoff     | **Jobs**                            | Commit `d814af8` on PR #50. Body-rendering queries now `replace(replace(<expr>, chr(13), ''), chr(10), '\n')`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Task 1.2 — Reference file matches new rebuild                          | **Jobs**                            | `scripts/.116c/prod-functions-def.txt` byte-identical to artefact from CI run 27190675520; rebuild and reference produce immune_fp `e5db4aeff7b0d3ccd07c1c3650e9276a`.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Task 1.3 — CI 10/10 MATCH on new fp                                    | **Jobs**                            | Run 27190675520, commit `d814af8`. Functions fp = `e5db4aeff7b0d3ccd07c1c3650e9276a` matches dispatch's stated live-prod target. ALL CHECKED DIMENSIONS CLEAN.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Task 1.4 — ATTESTATION-HANDOFF.md updated                              | **Jobs**                            | functions fp updated; CR-immune note added alongside collation/timezone immunity; all four body-rendering query blocks updated with the double-replace form.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Task 2.1 — Contamination preserved on PR #49                           | **Jobs (already done by Lauren)**   | Landing-branch commit `3ce05f6` titled "Re-lands the full makeover on the deploy branch... Recovered verbatim from 519a688; prior session's commits had landed on a 116c branch via an external branch switch and never reached this branch." All 6 contamination-created files (`src/app/pricing/page.tsx`, `src/app/v1/page.tsx`, `src/components/shared/LandingPageV1.tsx`, `src/components/shared/marketing/SealPlayer.tsx`, `src/remotion/SealComposition.tsx`, `src/styles/landing-tokens.ts`) verified present on `feat/landing-makeover` with the §11 pricing-gate logic preserved. |
| Task 2.2 — PR #50 substrate-only at 10/10                              | **Jobs**                            | `git ls-tree HEAD` confirms no landing/pricing files. CI green at 10/10 on `d814af8`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Task 2.3 — PR #50 ready-for-review                                     | **Jobs**                            | `gh pr ready 50`; PR title updated to "chore(116c): full-graph attestation harness + CI workflow — substrate reproducibility, 10/10 sealed".                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| PR #47 closure                                                         | **needs-Lauren**                    | Closeout comment posted; shared-state action deferred.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| PR #50 merge                                                           | **needs-Lauren**                    | Code does not self-merge.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Paint Sweep 2+3                                                        | **blocked**                         | Top-level Claude session required in `C:\Users\PC\WOHJO-paint` (subagent sandbox refuses).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Security-DEFINER search_path hardening                                 | **deferred (post-merge)**           | Proposal at `scripts/.116c/PROPOSAL-security-definer-search-path-lock.md`. Forward migration after #50 merges.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Optional: normalise `admins_set_updated_at.prosrc` to LF in production | **deferred (post-merge, optional)** | Forward migration to retire the CRLF artefact at source so a strict byte-compare also passes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Drift gate Stage 3 branch protection                                   | **needs-Lauren**                    | Blocked on `PGURL_PROD_READONLY` secret provisioning per `LAUREN-ACTIONS.md` action 2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Functions fingerprint confirmation

- Rebuild on PR #50 / commit `d814af8` (CI run 27190675520):
  `functions  11  e5db4aeff7b0d3ccd07c1c3650e9276a`
- Dispatch-stated live-prod target (chat-Claude attestation):
  `826e981f41eacc874d8280f12c22d3d9` (pre-CR-strip live-prod fp)
- **CR-immune live-prod fp (per dispatch):
  `e5db4aeff7b0d3ccd07c1c3650e9276a`** — equals rebuild exactly.

Result: byte-equal on the CR-immune side. All 10 dimensions MATCH.

## Five contamination commits on PR #49 — preservation confirmed

| commit                                       | files                                                                                                      | preserved on PR #49 via                                              |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `038e899` scaffold tokens/v1 + Remotion seal | 5 files (`landing-tokens.ts`, `LandingPageV1.tsx`, `SealComposition.tsx`, `SealPlayer.tsx`, `v1/page.tsx`) | `3ce05f6` (verbatim re-land)                                         |
| `743989d` landing IA rebuild                 | `LandingPage.tsx` 2086 lines                                                                               | `3ce05f6` + `aecc7ca` (craft pass)                                   |
| `0a50b56` PhoneFrame fidelity                | `MarketingScreenshots.tsx`                                                                                 | `3ce05f6`                                                            |
| `55d917d` gated pricing route                | `pricing/page.tsx` + ledger files                                                                          | `3ce05f6`                                                            |
| `519a688` compliance copy verbatim           | `pricing/page.tsx` + `LandingPage.tsx`                                                                     | `3ce05f6` (Lauren's commit explicitly cites recovering from 519a688) |

PR #49's commit `3ce05f6` message: "Re-lands the full makeover on the deploy branch ... Recovered verbatim from 519a688; prior session's commits had landed on a 116c branch via an external branch switch and never reached this branch."

The contamination commits' original SHAs only ever existed on `chore/116c-full-graph-bulletproof-2026-06-08`; they will be unreachable once that branch is abandoned, but the WORK is preserved on `feat/landing-makeover` (PR #49) with provenance noted in the commit message.

## DECISIONS NEEDED (collected)

1. **Merge PR #50** — Lauren's authorisation.
2. **Close PR #47** — after PR #50 merges; comment already posted.
3. **Provision `PGURL_PROD_READONLY`** secret per `LAUREN-ACTIONS.md`
   action 2 — activates hourly drift gate and Stage 3 branch
   protection.
4. **Schedule the SECURITY-DEFINER search_path hardening migration**
   per `scripts/.116c/PROPOSAL-security-definer-search-path-lock.md`
   — after PR #50 merges.
5. **Schedule the optional `admins_set_updated_at` CRLF retirement**
   forward migration — after PR #50 merges, if desired (the CR-immune
   normalisation makes it not load-bearing; it is hygiene only).
6. **Paint Sweep 2+3** — relaunch as top-level Claude session in
   `C:\Users\PC\WOHJO-paint`.

## Branch protection state — unchanged

`main` required contexts:

```
- "Run 7 bulletproof scenarios"
- "Real-PG full-graph attestation"
```

Stage 3 (drift gate required) blocked on DECISION 3 above.

## Compliance summary

- Did NOT write to production.
- Did NOT merge.
- Did NOT close PR #47 (shared-state, deferred).
- Did NOT force-push (would have orphaned the 5 contamination commits
  before Lauren had a chance to preserve them — though as it turned
  out, she already had via `3ce05f6`).
- Did NOT touch any function body or migration to chase the
  fingerprint. The fingerprint moved to immunity-against-CR; the
  bodies stayed correct.
- Did NOT weaken `/command` or strip auth from worker PWA.
- Surfaced each judgement call (the CR-immune approach, the
  preservation status of contamination commits, the order of branch
  cleanup steps).

## Suggested next actions for Lauren

1. Review PR #50 (`chore/116c-substrate-clean-2026-06-09` → `main`).
2. Merge PR #50 (substrate-only diff, 10/10 sealed, all gates green).
3. Close PR #47 (the contaminated branch's PR) with a pointer to #50.
4. Provision `PGURL_PROD_READONLY` to activate drift gate.
5. Relaunch paint Sweep 2+3 as a top-level session in
   `C:\Users\PC\WOHJO-paint`.
