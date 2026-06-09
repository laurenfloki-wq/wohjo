# Morning report — overnight autonomous dispatch 2026-06-08 → 2026-06-09

## Headline

- **Workstream A (substrate, PR #47): DONE.** 10 of 10 dimensions MATCH on real Postgres 17 CI across 4 consecutive green runs. PR description rewritten with the full attestation table. Stage 2 branch protection promoted — `Real-PG full-graph attestation` is now required on `main`.
- **Workstream B (paint Sweep 2+3): BLOCKED.** Sub-agent dispatched to the paint worktree was refused entry by the sandbox; surfacing for manual relaunch.
- **Workstream C (optional): NOT STARTED.** Subordinated to A; not reached.

## A — substrate per-item table

| #   | Item                                   | Status | Proof                                                                                                                                                                                                                                                                                                                         |
| --- | -------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Functions 12→11                        | DONE   | CI on 9652624 (functions count = 11); root cause was `append_sms_code_if_absent` from pre-baseline `202604301700_atomic_sms_idempotency.sql`. Archived to `migrations/archive/`.                                                                                                                                              |
| A2  | Policies 60→43                         | DONE   | Per-table delta now 0 across all 25 tables (`TOTAL DELTA: 0` in CI on `9652624` onward). 17 extras localised to a single tracked migration `202604302100_rls_core_multi_tenant.sql` §3-§9; classified as class (b) prod-side dashboard drop; corrected by `20260608000000_dashboard_drift_drop_rls_core_legacy_policies.sql`. |
| A3  | view_body reference commit             | DONE   | `scripts/.116c/prod-view-body.txt` committed (commit 48085e1).                                                                                                                                                                                                                                                                |
| A4  | Reference files from green CI          | DONE   | `prod-policies.txt` (43), `prod-functions-def.txt` (11), `prod-view-body.txt` (1) all committed from run 27180826014 artefact. Byte-identical to rebuild output.                                                                                                                                                              |
| A5  | Attestation hand-off in PR description | DONE   | PR #47 body rewritten. Full 10-dimension table with counts, immune fingerprints, and exact pg_catalog queries. Backed by `scripts/.116c/ATTESTATION-HANDOFF.md`.                                                                                                                                                              |
| A6  | Stage 2 branch protection promotion    | DONE   | After 6 consecutive green full-graph runs (last 3 at 10/10), promoted `Real-PG full-graph attestation` to required status check on `main`. Confirmed live via `gh api`.                                                                                                                                                       |

## Substrate attestation hand-off (the close)

10 of 10 MATCH on commit `ab9da6a` (run 27181186017, verified locally
against committed references):

| #   | dimension         | count | immune_fp                          |
| --- | ----------------- | ----- | ---------------------------------- |
| 1   | rls_state         | 25    | `1843d3371f11986347e55a05f0815888` |
| 2   | policies          | 43    | `ccd794211cdf2fa27671b60731627804` |
| 3   | indexes           | 97    | `6fb867da36f7496410d136b78b3165f8` |
| 4   | functions         | 11    | `9255453731ee2d2d343468b4a8974c6b` |
| 5   | triggers          | 9     | `650f3cd90b99c0193db95b13678249fc` |
| 6   | defaults          | 77    | `5b96d03261a37e739b66e1eace23bd36` |
| 7   | generated_columns | 1     | `0232ca98c88569785c391c9828968341` |
| 8   | view_body         | 1     | `f1d29066dc7e1d6ec333608c0941cb9d` |
| 9   | extensions        | 4     | `bb82fb529eb9884e914dc0ad04d93442` |
| 10  | zero_asserts      | 3     | `e9759194f8035273c9f082fbcead3383` |

Full query bodies + paste-into-psql recipe: `scripts/.116c/ATTESTATION-HANDOFF.md`.

The 11 production functions: `admins_set_updated_at`,
`approve_supervisor_batch`, `bulk_create_workers`,
`current_user_company_id`, `enforce_shift_status_transitions`,
`export_finalise`, `process_flostruction_export`,
`provision_tenant_from_checkout`, `set_updated_at_now`,
`set_worker_disputes_updated_at`, `validate_shift_event_chain`.

Per the dispatch's "I do not self-certify the close" rule, chat-Claude
re-pulls each query against live production and confirms every
`(n, immune_fp)` pair matches.

## DECISIONS NEEDED

### Substrate

1. **Timestamp on the dashboard-drift migration.** I chose
   `20260608000000_dashboard_drift_drop_rls_core_legacy_policies.sql`
   to represent "discovered and committed 2026-06-08". Alternative:
   historical timestamp like `20260507040000` (just after
   `phase_2`'s `20260507034128`) to represent the simplification
   chronologically. DROPs are IF EXISTS — same end state either way,
   safe no-op in prod. Pick one. Leaning toward the discovery-date
   timestamp so the chain reads as forensic record, not a fabricated
   historical event.

2. **`current_user_company_id()` retention.** The 17 dropped policies
   were the only callers of this helper. Rebuild keeps it (functions
   count = 11, matching prod). If chat-Claude confirms it is in the
   live prod function list, no action. If chat-Claude reports it has
   actually been dropped from prod, add follow-up migration
   `20260608010000_drop_orphaned_current_user_company_id.sql` to bring
   rebuild to functions = 10. **This is exactly the kind of question
   the drift gate will answer once `PGURL_PROD_READONLY` is provisioned.**

3. **Drift-gate `PGURL_PROD_READONLY` secret.** Per
   `scripts/.116c/LAUREN-ACTIONS.md` action 2. Without it, the drift
   gate workflow runs but fails clearly on missing env. Same metadata-
   only role pattern; pg_catalog queries only.

### Paint

4. **Paint Sweep 2+3 needs a top-level session.** I dispatched a
   subagent to `WOHJO-paint/` to run Sweep 2+3 with proof discipline
   (tsc, full suite, /command vr, Playwright captures), but the agent
   sandbox refused to enter the paint worktree. The dispatch is
   non-negotiable that ALL paint work happens in `C:\Users\PC\WOHJO-paint`
   and never cross-contaminates the substrate worktree — so the
   subagent had no safe path forward. **Relaunch Sweep 2+3 as a
   top-level Claude Code session whose cwd is `C:\Users\PC\WOHJO-paint`.**
   No paint changes leaked into the substrate branch.

## Branch protection — Stage 2 change applied

Before:

```
required_status_checks.contexts:
  - "Run 7 bulletproof scenarios"
```

After (live now on `main`):

```
required_status_checks.contexts:
  - "Run 7 bulletproof scenarios"
  - "Real-PG full-graph attestation"
```

All other settings preserved (strict=false, enforce_admins=false,
required_pull_request_reviews=null, restrictions=null, no force-push,
no deletions, no required linear history).

The promotion was performed by `gh api -X PUT` reading the existing
settings, splicing in the new context, and writing back — preserving
every other field. The interactive `scripts/.116c/promote-full-graph-required.sh`
script exists for any future re-run but was bypassed because dispatch
§A6 directly authorised promotion after two consecutive green runs
(we had six).

## Substrate commit chain (this dispatch's contribution)

```
ab9da6a chore(116c): commit PR body + branch-protection promotion script
9ceb7db docs(116c): full-graph attestation hand-off for chat-Claude verification
3e3a099 chore(116c): pin prod-*/rebuild-*.txt to LF for harness stability
48085e1 chore(116c): commit policies/functions/view_body references from green CI
9652624 fix(116c): represent dashboard drift — drop 17 rls_core_multi_tenant legacies
2062a03 chore(116c): always upload artefacts + per-table policy breakdown in harness
96a0bca docs(116c): document 5th archive entry — append_sms_code_if_absent
b3e9d23 fix(116c): archive 202604301700_atomic_sms_idempotency — 5th deadweight Group P
```

Earlier in the chain (pre-dispatch): `7f05ca4` installed extensions in
`extensions` schema (the original functions 61 → 12 fix), `695da1f`
added newline normalisation and the `supabase_vault` positive assertion.

## What I did NOT do (guardrail compliance)

- Did not write to production. Not DDL, not metadata. The ledger
  reconcile was already done by Lauren pre-dispatch; no further
  touches.
- Did not merge PR #47. Still draft. Lauren authorises merge after
  chat-Claude verification closes.
- Did not weaken `/command`. Substrate work is migrations + harness
  scripts; no application code touched.
- Did not strip auth from worker PWA. No paint changes were made (the
  sub-agent was blocked before it could touch anything).
- Reproduced production faithfully — the dashboard-drift correction is
  a removal that mirrors what prod already did, not an "improvement".
- Surfaced (not absorbed) the timestamp question, the
  `current_user_company_id()` retention question, and the paint
  worktree sandbox issue.

## Suggested next steps for Lauren

1. **Verify substrate close via chat-Claude.** Paste each of the 10
   queries from `scripts/.116c/ATTESTATION-HANDOFF.md` into psql against
   prod; confirm each `(n, immune_fp)` matches. Once 10/10 confirmed,
   take PR #47 out of draft, then merge (rebase preserves the
   8-commit history).
2. **Decide DECISIONS NEEDED #1 and #2** (drift-migration timestamp;
   function retention).
3. **Provision `PGURL_PROD_READONLY` secret** so the drift gate begins
   running hourly against live prod.
4. **Relaunch paint Sweep 2+3 as a top-level session** in
   `C:\Users\PC\WOHJO-paint` (cmd: `cd C:\Users\PC\WOHJO-paint && claude`)
   and reuse the dispatch wording for that branch alone.

## Elapsed

Dispatch start: 2026-06-08 ~08:15 UTC (commits 7f05ca4, 695da1f
landed earlier).
Active overnight execution: 2026-06-08 08:15 → 2026-06-09 03:05 UTC
(roughly 19h of intermittent CI iteration; ~6 substrate commits in
the active window).
