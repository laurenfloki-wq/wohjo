# Continuation report — 2026-06-09 evening

This replaces the morning report after the dispatch continuation.
The earlier morning report stays accurate through commit `2a5cff7`
and is preserved in git history; this is the updated headline as of
commit `bb07c8a`.

## Headline

- **Workstream A (substrate, PR #47):** 10 of 10 dimensions MATCH on
  real Postgres 17 CI rebuild. 9 of 10 chat-Claude-attested against
  live production. **1 dimension (functions) is sealed on the rebuild
  side; the body of `count_broken_chain_links` awaits a single
  byte-exact verification by chat-Claude.** PR description rewritten;
  closeout comment posted.
- **Shippable-readiness ledger:** committed at
  `scripts/.116c/SHIPPABLE-LEDGER.md`. 52 items across 6 pillars.
- **Workstream B (paint Sweep 2+3):** still BLOCKED. Subagent cannot
  enter `WOHJO-paint/` worktree; needs a top-level Claude session.
- **Substrate branch contamination:** four commits with landing-page
  work were pushed to the substrate branch by a concurrent session
  during this run. Surfaced.

## P1 — what changed since the morning report

### A1 (functions count) — was DONE, stays DONE

Functions count = 11 unchanged. The fix landed in commit `b3e9d23`
(archive `append_sms_code_if_absent`).

### A2 (policies count) — was DONE, stays DONE

Policies count = 43 unchanged. The fix landed in commit `9652624`
(`20260608000000_dashboard_drift_drop_rls_core_legacy_policies.sql`).

### Functions dimension — was needs-chat-Claude, still needs-chat-Claude

chat-Claude's 2026-06-09 attestation showed:

- The dispatch's claim that `set_worker_disputes_updated_at` body
  diverged from prod was incorrect — the rebuild already emits the
  dispatched target body byte-for-byte (`SET search_path TO ''`,
  rest identical).
- The actual divergence is a **1:1 function swap**:
  - rebuild had: `current_user_company_id` (helper from
    `202604302100_rls_core_multi_tenant.sql`; orphan after
    dashboard-drift dropped its 17 RLS callers)
  - prod has: `count_broken_chain_links` (SECURITY DEFINER,
    LANGUAGE sql, present in prod but never tracked via migration)

**Resolution (commit ac5a8f3, paired migrations):**

1. `20260608000000_dashboard_drift_drop_rls_core_legacy_policies.sql`
   extended with `DROP FUNCTION IF EXISTS public.current_user_company_id()`.
2. `20260609000000_create_count_broken_chain_links.sql` created. Body
   sourced from `tests/integration-postgres/bootstrap.sql` plus
   `SECURITY DEFINER` + `SET search_path = 'public'` per chat-Claude's
   name-snapshot attributes.

After the fix, functions count stays 11 but identity changes. Rebuild
fingerprint went from `9255453731ee2d2d343468b4a8974c6b` to
`fd7c3055547e82f7fb4fdaeece01ef2f`. The dispatch-stated live-prod
target is `826e981f41eacc874d8280f12c22d3d9` — still differs. Most
likely the `count_broken_chain_links` body has slightly different
attributes in prod (`SECURITY INVOKER` vs `DEFINER`, or
`search_path = 'public, extensions'` instead of `'public'`).

**ATTESTATION HANDOFF:** Paste this into psql against prod:

```sql
SELECT md5(replace(pg_get_functiondef('public.count_broken_chain_links()'::regprocedure), chr(10), '\n')) AS prod_md5;
```

Compare to rebuild's `1fa5d8f1df6502a2e33b4a57dc2ab400`. If different,
dump the raw `pg_get_functiondef` output and I adjust
`migrations/20260609000000_create_count_broken_chain_links.sql`.

## Substrate attestation table — current

10 of 10 MATCH on commit `bb07c8a`:

| #   | dimension         | count | immune_fp                          | chat-Claude live-prod status |
| --- | ----------------- | ----- | ---------------------------------- | ---------------------------- |
| 1   | rls_state         | 25    | `1843d3371f11986347e55a05f0815888` | Jobs (sealed 2026-06-09)     |
| 2   | policies          | 43    | `ccd794211cdf2fa27671b60731627804` | Jobs (sealed 2026-06-09)     |
| 3   | indexes           | 97    | `6fb867da36f7496410d136b78b3165f8` | Jobs (sealed 2026-06-09)     |
| 4   | functions         | 11    | `fd7c3055547e82f7fb4fdaeece01ef2f` | needs-chat-Claude (one body) |
| 5   | triggers          | 9     | `650f3cd90b99c0193db95b13678249fc` | Jobs (sealed 2026-06-09)     |
| 6   | defaults          | 77    | `5b96d03261a37e739b66e1eace23bd36` | Jobs (sealed 2026-06-09)     |
| 7   | generated_columns | 1     | `0232ca98c88569785c391c9828968341` | Jobs (sealed 2026-06-09)     |
| 8   | view_body         | 1     | `f1d29066dc7e1d6ec333608c0941cb9d` | Jobs (sealed 2026-06-09)     |
| 9   | extensions        | 4     | `bb82fb529eb9884e914dc0ad04d93442` | Jobs (sealed 2026-06-09)     |
| 10  | zero_asserts      | 3     | `e9759194f8035273c9f082fbcead3383` | Jobs (sealed 2026-06-09)     |

## DECISIONS NEEDED

1. **count_broken_chain_links body byte-exact** — chat-Claude paste +
   md5. If diverges from `1fa5d8f1df6502a2e33b4a57dc2ab400`, adjust
   `migrations/20260609000000_create_count_broken_chain_links.sql`.

2. **PGURL_PROD_READONLY secret** — Lauren provisions per
   `LAUREN-ACTIONS.md` action 2. Once live, the drift gate runs hourly
   and DECISION 1 above becomes self-attesting on the next run.

3. **PR #47 merge** — Lauren authorises after DECISION 1 resolves.

4. **Paint Sweep 2+3** — relaunch as top-level Claude session in
   `C:\Users\PC\WOHJO-paint` (no other Claude session can enter that
   worktree from outside).

5. **Substrate-branch cross-contamination** — four commits with
   landing-page work were pushed to
   `chore/116c-full-graph-bulletproof-2026-06-08` during this
   dispatch run by a concurrent session (`038e899`, `743989d`,
   `0a50b56`, `55d917d`). They don't break substrate state but
   shouldn't be in this PR. Two paths: (a) cherry-pick the 116c
   commits onto a clean branch for merge; (b) leave as-is and merge
   wholesale. The hard guardrail "never cross-contaminate" suggests
   (a). Defer to Lauren — the concurrent session is presumably also
   her work.

## Branch protection state — Stage 2 live

```
required_status_checks.contexts:
  - "Run 7 bulletproof scenarios"
  - "Real-PG full-graph attestation"
```

Promoted 2026-06-09 morning after 6 consecutive green full-graph runs.
Stage 3 (drift-gate required) blocked on DECISION 2 above.

## Substrate commit chain (this dispatch's contribution, plus

contamination)

```
bb07c8a docs(116c): PR body — reflect functions swap + decisions resolved/open
55d917d feat(pricing): gated draft pricing route (§11) — 404s unless ...   [contamination]
0a50b56 feat(landing): device-kit PhoneFrame fidelity                       [contamination]
743989d feat(landing): rebuild IA — two-layer hero, cost, 3-step, ...      [contamination]
ac5a8f3 fix(116c): functions-dim divergence — drop current_user_company_id, add count_broken_chain_links
038e899 scaffold: tokens, /v1 route, Remotion seal composition ...         [contamination]
2d27b05 docs(116c): per-function md5 table — pinpoint functions-dim divergence
2a5cff7 docs(116c): overnight dispatch morning report 2026-06-09
ab9da6a chore(116c): commit PR body + branch-protection promotion script
9ceb7db docs(116c): full-graph attestation hand-off for chat-Claude verification
3e3a099 chore(116c): pin prod-*/rebuild-*.txt to LF for harness stability
48085e1 chore(116c): commit policies/functions/view_body references from green CI
9652624 fix(116c): represent dashboard drift — drop 17 rls_core_multi_tenant legacies
2062a03 chore(116c): always upload artefacts + per-table policy breakdown
96a0bca docs(116c): document 5th archive entry — append_sms_code_if_absent
b3e9d23 fix(116c): archive 202604301700_atomic_sms_idempotency
```

Substrate-only commits (for cherry-pick option): `bb07c8a`, `ac5a8f3`,
`2d27b05`, `2a5cff7`, `ab9da6a`, `9ceb7db`, `3e3a099`, `48085e1`,
`9652624`, `2062a03`, `96a0bca`, `b3e9d23`, and the earlier chain.

## What I did NOT do (guardrail compliance, unchanged from morning)

- Did not write to production.
- Did not merge PR #47. Still draft.
- Did not weaken `/command`.
- Did not strip auth from worker PWA.
- Did not guess function bodies once it became clear the dispatch's
  attribution of the divergence was off — surfaced the per-function
  md5 table and waited for chat-Claude pinpoint.
- Did not silently bundle the count_broken_chain_links creation — the
  body is provisional and clearly marked APPROXIMATE in the migration
  header pending byte-exact verification.

## Suggested next steps for Lauren

1. **Verify count_broken_chain_links via chat-Claude.** Single paste
   into psql against prod; one md5 comparison. If matches, the
   functions dimension seals at 10/10 chat-Claude-attested and PR #47
   moves out of draft. If diverges, paste the raw
   `pg_get_functiondef` output here and I adjust the migration.
2. **Decide on branch contamination cleanup** (DECISION 5).
3. **Provision `PGURL_PROD_READONLY`** so the drift gate begins
   running hourly (DECISION 2).
4. **Relaunch paint Sweep 2+3** as a top-level Claude session in
   `C:\Users\PC\WOHJO-paint`.
