# Continuation report 3 — 2026-06-09 evening (post-clean-branch)

## Headline

- **Workstream A (substrate):** rebuilt on a clean substrate-only
  branch (`chore/116c-substrate-clean-2026-06-09`, PR #50). All 10
  dimensions MATCH on rebuild side. 9 of 10 dimensions retain their
  chat-Claude-sealed-against-live-prod fingerprints byte-for-byte.
  **Functions dimension still diverges from live prod** — the body of
  `count_broken_chain_links` now matches the dispatched target
  (per-fn md5 `444ac463e346c72b96e093d43b26ccb0`), but at least one
  of the other 10 retained function bodies also diverges from live
  prod (rebuild dim fp `e5db4aeff7b0d3ccd07c1c3650e9276a` vs target
  `826e981f41eacc874d8280f12c22d3d9`). chat-Claude per-function md5
  attestation against live prod is the next step.
- **PR #47** has been left open with a closeout comment pointing at
  PR #50. GitHub does not allow changing the head branch of an open
  PR via REST, and force-pushing the clean state to the old branch
  would have orphaned the 5 landing/pricing contamination commits
  (which currently only exist on that branch). Lauren closes #47
  after #50 is approved.
- **PR #50** opened, draft, with the substrate-only diff and the
  full DECISIONS NEEDED list.
- **Paint Sweep 2+3** still blocked — top-level Claude session in
  `WOHJO-paint` required.
- **Branch protection Stage 2** unchanged — still live on `main`.

## Branch operation summary

Per dispatch (Decision #5 ruled: separate, never merge-wholesale):

- New branch `chore/116c-substrate-clean-2026-06-09` from `origin/main`.
- **22 substrate commits cherry-picked verbatim** (5eb671b → e9d7bf3
  inclusive, with 55d917d's substrate-only files extracted via
  `cherry-pick -n` + drop of `src/app/pricing/page.tsx`).
- **5 contamination commits EXCLUDED:** `038e899` scaffold
  tokens/v1, `743989d` landing IA, `0a50b56` PhoneFrame, `55d917d`
  pricing route (contamination part), `519a688` compliance copy.
- **1 fresh body-fix commit** (`b5111bb`) — corrects
  `count_broken_chain_links` body to dispatched verbatim
  (`SELECT count(*)::bigint AS n`, `SET search_path TO 'public'`,
  `$function$` dollar tag, leading-space lines for RETURNS / LANGUAGE
  / SECURITY / SET).
- **1 reference refresh commit** (`8805b83`) — committed the rebuild
  artefact's `prod-functions-def.txt` so CI MATCHes on rebuild side.

Total: 24 commits on the clean branch (22 cherry-picked + 2 new).
No landing/pricing files leak into substrate tree (verified via
`git ls-tree`).

The 5 contamination commits remain on the original
`chore/116c-full-graph-bulletproof-2026-06-08` branch and need to be
migrated to the landing PR (#49 `feat/landing-makeover`) by whoever
owns that work. They are NOT on any landing branch currently.

## Functions dimension — final byte-match attestation needed

Per-function md5s (rebuild on PR #50 / commit `8805b83`):

| name                               | rebuild line md5                                  |
| ---------------------------------- | ------------------------------------------------- |
| `admins_set_updated_at`            | `1cca4138d268c1f978eea55061cb9268`                |
| `approve_supervisor_batch`         | `96dbcca13ed48cdb9800963ff5f07ffe`                |
| `bulk_create_workers`              | `5d076d9c7005bf0d15c38764f15af1b2`                |
| `count_broken_chain_links`         | `444ac463e346c72b96e093d43b26ccb0` ← TARGET MATCH |
| `enforce_shift_status_transitions` | `5311f344cf73ab57b33139db4a14eaf7`                |
| `export_finalise`                  | `663c2945afcc8cfb2052cb2940f56009`                |
| `process_flostruction_export`      | `01a7a8ef2780e8302030818ccb5f15fb`                |
| `provision_tenant_from_checkout`   | `97fcc66c455bd13060af711159de2ec6`                |
| `set_updated_at_now`               | `d91bdaf56f1def5438baad5d41ba0faf`                |
| `set_worker_disputes_updated_at`   | `0099362a5381cec64887ed3ed1c4f047`                |
| `validate_shift_event_chain`       | `371b3e6e54df1cbefb06332fce6e966f`                |

Dimension immune_fp: `e5db4aeff7b0d3ccd07c1c3650e9276a`
Dispatch-stated live-prod target: `826e981f41eacc874d8280f12c22d3d9`

The dispatch's assumption that "the other ten must equal production's
references already provided" was rebuild-side circular — the
previously committed `prod-functions-def.txt` was generated from
rebuild output, not directly from live prod. The 9-of-10 dimension
sealing was at the dimension-fp level only and reflected the OLD
reference (which had `current_user_company_id`); after the swap, the
sealing carries through for the 9 unchanged dimensions but NOT for
functions.

### ATTESTATION HANDOFF for chat-Claude

Paste against live production:

```sql
SELECT (regexp_match(line, 'FUNCTION public\.(\w+)'))[1] AS name,
       md5(line) AS line_md5
FROM (
  SELECT replace(pg_get_functiondef(p.oid), chr(10), '\n') AS line
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
) q
ORDER BY 1;
```

Compare each `(name, line_md5)` pair to the table above. For each row
where live-prod md5 differs, dump the raw `pg_get_functiondef(...)`
output and I adjust the source migration to match.

Once all 11 per-function md5s match prod, the dimension fp will be
`826e981f41eacc874d8280f12c22d3d9` and PR #50 reaches 10-of-10
byte-exact sealed against live prod.

## Dimension-fp table on PR #50 — current

| #   | dimension         | count | rebuild fp = reference fp          | live-prod fp (per chat-Claude)     | sealed?        |
| --- | ----------------- | ----- | ---------------------------------- | ---------------------------------- | -------------- |
| 1   | rls_state         | 25    | `1843d3371f11986347e55a05f0815888` | `1843d3371f11986347e55a05f0815888` | YES            |
| 2   | policies          | 43    | `ccd794211cdf2fa27671b60731627804` | `ccd794211cdf2fa27671b60731627804` | YES            |
| 3   | indexes           | 97    | `6fb867da36f7496410d136b78b3165f8` | `6fb867da36f7496410d136b78b3165f8` | YES            |
| 4   | functions         | 11    | `e5db4aeff7b0d3ccd07c1c3650e9276a` | `826e981f41eacc874d8280f12c22d3d9` | NO (one+ body) |
| 5   | triggers          | 9     | `650f3cd90b99c0193db95b13678249fc` | `650f3cd90b99c0193db95b13678249fc` | YES            |
| 6   | defaults          | 77    | `5b96d03261a37e739b66e1eace23bd36` | `5b96d03261a37e739b66e1eace23bd36` | YES            |
| 7   | generated_columns | 1     | `0232ca98c88569785c391c9828968341` | `0232ca98c88569785c391c9828968341` | YES            |
| 8   | view_body         | 1     | `f1d29066dc7e1d6ec333608c0941cb9d` | `f1d29066dc7e1d6ec333608c0941cb9d` | YES            |
| 9   | extensions        | 4     | `bb82fb529eb9884e914dc0ad04d93442` | `bb82fb529eb9884e914dc0ad04d93442` | YES            |
| 10  | zero_asserts      | 3     | `e9759194f8035273c9f082fbcead3383` | `e9759194f8035273c9f082fbcead3383` | YES            |

## DECISIONS NEEDED

1. **chat-Claude per-function md5 attestation** — paste the
   localisation query above into psql against prod; for each row whose
   live-prod md5 differs from PR #50's rebuild md5, dump the raw
   `pg_get_functiondef(...)` so I can adjust the source migration.

2. **PR #47 closure** — close after PR #50 is approved. Discussion
   history preserved.

3. **Migrate the 5 contamination commits** off
   `chore/116c-full-graph-bulletproof-2026-06-08` onto the landing
   PR (#49 `feat/landing-makeover`) before that branch is abandoned.
   Currently the contamination commits exist nowhere else.

4. **Paint Sweep 2+3** — top-level Claude session in
   `C:\Users\PC\WOHJO-paint` (unchanged).

5. **`PGURL_PROD_READONLY` secret** — Lauren provisions per
   `scripts/.116c/LAUREN-ACTIONS.md` action 2 (unchanged).

6. **PR #50 merge** — Lauren's authorisation only, after DECISION 1
   seals the functions dimension and PR #50 moves out of draft.

## Cross-session activity observed

During this run, my local working tree was switched away from the
substrate branch three times by a concurrent session (presumably
the landing-page worker). Each time I detected the switch, stashed
local changes, switched back, and resumed. No substrate work was
lost. The contamination commits documented above were pushed to the
substrate branch by that same session before I created the clean
branch.

For future overnight dispatches: the substrate worker and the
landing/paint worker each need a dedicated branch that the other
session does not touch. The "separate worktrees" guardrail is the
right pattern; the breakage above was the substrate worktree being
shared as a checkout target.

## Compliance note

I did NOT force-push the clean state over the contaminated branch,
even though that would have re-pointed PR #47 directly. The
contamination commits only exist on that branch; orphaning them
without their owner's authorisation is destructive shared-state
intervention. Opened PR #50 as the safer path.

I did NOT close PR #47 — closing a PR is shared-state and the dispatch
did not pre-authorise it explicitly. Surfaced as DECISION #2 above
for Lauren to action.

I did NOT change any of the 10 retained function bodies pre-emptively
to chase the dim-fp target. The dispatch was explicit: "do not change
the other ten" without confirmation. Each must be localised by
chat-Claude first.
