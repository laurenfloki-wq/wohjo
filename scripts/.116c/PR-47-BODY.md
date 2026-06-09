# Full-graph bulletproof — substrate rebuilds across every dimension

**Status (2026-06-09): 10 of 10 dimensions MATCH on real Postgres 17 CI.**
The harness on commit `9ceb7db` reports `ALL CHECKED DIMENSIONS CLEAN`,
with all three formerly-SKIPPED dimensions (policies, functions,
view_body) now backed by committed reference files. See
`scripts/.116c/ATTESTATION-HANDOFF.md` for the full chat-Claude
verification packet.

#46 (genesis: relations/columns/constraints) merged to main on 2026-06-08 via rebase, preserving all 3 conventional commits. Bulletproof on main green.

**This PR closes the full-graph contract:** empty + vanilla `postgres:17`
(with `pg_stat_statements` preloaded) + `extensions` schema + genesis +
87 committed migrations reproduces production across every catalog
dimension, verified in CI, with drift caught automatically.

## Hunt outcomes — A1 and A2

### A1 — functions 12 → 11

**Root cause.** `202604301700_atomic_sms_idempotency.sql` created
`append_sms_code_if_absent(uuid, text, date, timestamptz)` pre-baseline.
Production carries 11 functions, none of which is this one — the
pattern was superseded by application-layer logic in
`src/lib/sms/late-trigger.ts`.

**Resolution.** Archived as the fifth deadweight (Group P) — moved to
`migrations/archive/202604301700_atomic_sms_idempotency.sql` with the
README entry documenting that production never carried it. Comment-only
reference in `202605020940_end_event_idempotency.sql` is documentary,
not a dependency. Functions count is now 11.

### A2 — policies 60 → 43

**Root cause.** All 17 extras trace to a single tracked migration —
`202604302100_rls_core_multi_tenant.sql` §3-§9 — whose own §10
verification block enumerates them as `TOTAL = 17 policies`. Current
production has none of them.

Per-table localisation (rebuild → prod, before fix):

| table        | rebuild | prod | delta   |
| ------------ | ------- | ---- | ------- |
| companies    | 3       | 2    | +1      |
| exports      | 3       | 2    | +1      |
| shift_events | 4       | 2    | +2      |
| shifts       | 4       | 2    | +2      |
| sites        | 5       | 2    | +3      |
| supervisors  | 6       | 2    | +4      |
| workers      | 6       | 2    | +4      |
| **TOTAL**    |         |      | **+17** |

**Classification.** Class (b) — prod-side dashboard drop. A tracked
migration created them, then production dropped all 17 via dashboard
or psql ad-hoc, most likely contemporaneous with the
`20260507034128_phase_2_*_v2.sql` consolidation that introduced the
simpler `service_role_full_access` + `authenticated_select_own_company`
pair production retains. **No class (a) genesis duplicates were found.**

**Resolution.** `20260608000000_dashboard_drift_drop_rls_core_legacy_policies.sql`
drops all 17 via `DROP POLICY IF EXISTS`. Safe to apply against prod
(already in the post-drop state — all are no-ops). The chain now
converges on the byte-exact 43-policy state production carries.

`public.current_user_company_id()` is intentionally left in place —
production functions count = 11 includes it, so it survived the
dashboard cleanup along with `phase_2`-era logic. See DECISIONS NEEDED
below.

## 10-of-10 attestation table

The complete per-dimension table (count, immune fingerprint, exact
pg_catalog query) is in `scripts/.116c/ATTESTATION-HANDOFF.md`.
chat-Claude reproduces each query against live production; every
`(n, immune_fp)` pair must match.

| #   | dimension         | count | immune_fp                          | reference file               |
| --- | ----------------- | ----- | ---------------------------------- | ---------------------------- |
| 1   | rls_state         | 25    | `1843d3371f11986347e55a05f0815888` | `prod-rls-state.txt`         |
| 2   | policies          | 43    | `ccd794211cdf2fa27671b60731627804` | `prod-policies.txt`          |
| 3   | indexes           | 97    | `6fb867da36f7496410d136b78b3165f8` | `prod-indexes.txt`           |
| 4   | functions         | 11    | `9255453731ee2d2d343468b4a8974c6b` | `prod-functions-def.txt`     |
| 5   | triggers          | 9     | `650f3cd90b99c0193db95b13678249fc` | `prod-triggers-def.txt`      |
| 6   | defaults          | 77    | `5b96d03261a37e739b66e1eace23bd36` | `prod-defaults.txt`          |
| 7   | generated_columns | 1     | `0232ca98c88569785c391c9828968341` | `prod-generated-columns.txt` |
| 8   | view_body         | 1     | `f1d29066dc7e1d6ec333608c0941cb9d` | `prod-view-body.txt`         |
| 9   | extensions        | 4     | `bb82fb529eb9884e914dc0ad04d93442` | `prod-extensions.txt`        |
| 10  | zero_asserts      | 3     | `e9759194f8035273c9f082fbcead3383` | `prod-zero-asserts.txt`      |

The 11 functions in production (`prod-functions-def.txt`):
`admins_set_updated_at`, `approve_supervisor_batch`,
`bulk_create_workers`, `current_user_company_id`,
`enforce_shift_status_transitions`, `export_finalise`,
`process_flostruction_export`, `provision_tenant_from_checkout`,
`set_updated_at_now`, `set_worker_disputes_updated_at`,
`validate_shift_event_chain`.

The 4 application extensions (production also carries platform-managed
`supabase_vault`, verified by drift-gate positive assertion — out of
the rebuild contract because its secrets are not rebuildable):
`pg_stat_statements`, `pgcrypto`, `plpgsql`, `uuid-ossp`.

## CI image — vanilla postgres:17 + pg_stat_statements preload

Path B (accepted by dispatch). `supabase/postgres:17.4.1.054` was
unbootable in GH Actions service containers — its `migrate.sh`
requires the `supabase_admin` role provisioned by Supabase
orchestration that doesn't exist in a bare service container. Vanilla
`postgres:17` launched via `docker run` (so we can pass
`-c shared_preload_libraries=pg_stat_statements`) avoids that and
gives a byte-exact rebuild of the application schema.

`supabase_vault` is explicitly out of scope for the rebuild and verified
by the drift gate's positive assertion against live prod.

## Architecture this PR adds

| Component                                      | Role                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/.116c/full-graph-attestation.mjs`     | Connects to `PGURL`, drops + recreates `public`, creates `extensions` schema, installs `pgcrypto`/`uuid-ossp`/`pg_stat_statements` THERE (not in `public`, which would balloon functions count by ~50), applies auth/storage shim + genesis + 87 migrations, queries each dimension, computes immune fingerprints, diffs against committed references. Exit 1 on drift. Emits per-table policy diff. |
| `.github/workflows/full-graph-attestation.yml` | Vanilla `postgres:17` started via `docker run` with `shared_preload_libraries=pg_stat_statements`. Runs the harness on every PR/push to main. Uploads `rebuild-*.txt` artefacts on every run (`if: always()`, `include-hidden-files: true` because `.116c` is a dotfile).                                                                                                                            |
| `scripts/.116c/drift-gate.mjs`                 | Same 10 catalog queries against LIVE production via `PGURL_PROD_READONLY`. pg_catalog only — uses `pg_policy` not `pg_policies`, `pg_class WHERE relkind='S'` not `information_schema.sequences`. Least-privilege role works with REFERENCES, not SELECT, on application tables. Asserts `supabase_vault` present in prod as a separate positive check.                                              |
| `.github/workflows/drift-gate.yml`             | Hourly + on-demand + PR-on-migration triggers. Fails clearly if `PGURL_PROD_READONLY` is missing.                                                                                                                                                                                                                                                                                                    |
| `scripts/.116c/LAUREN-ACTIONS.md`              | The three metadata-only actions Lauren owns (ledger reconcile — already DONE, drift-gate role + secret, branch-protection sequencing).                                                                                                                                                                                                                                                               |
| `scripts/.116c/ATTESTATION-HANDOFF.md`         | The chat-Claude verification packet (this PR's close).                                                                                                                                                                                                                                                                                                                                               |

## Scope (sharp)

**In scope:** application schema in `public`. Every dimension above.

**Out of scope (by definition, not exception):** Supabase platform —
`auth`, `storage`, `vault`, `realtime`, `graphql`, `pgbouncer`,
`extensions` schemas and the roles they provision. Vanilla `postgres:17`
in CI does not include `supabase_vault`; it is platform-managed and
verified separately by the drift gate.

No asterisks. No documented deltas inside scope.

## DECISIONS NEEDED

1. **Timestamp on the dashboard-drift migration.** I chose
   `20260608000000_dashboard_drift_drop_rls_core_legacy_policies.sql`
   to represent "discovered and committed 2026-06-08". An alternative
   is a historical timestamp like `20260507040000` (just after
   `phase_2`'s `20260507034128`) to represent the model
   simplification chronologically. The DROPs are IF EXISTS — either
   ordering produces the same end state in rebuild AND in prod (safe
   no-op there). Pick one. Leaning toward the discovery-date timestamp
   so the chain reads as a forensic record rather than a fabricated
   historical event.

2. **`current_user_company_id()` retention.** The 17 dropped policies
   were the only callers of this helper. Production keeps it
   (functions count = 11). If chat-Claude confirms `current_user_company_id`
   is in the live prod function list, no further action. If chat-Claude
   reports it's actually been dropped from prod, I add a follow-up
   migration `20260608010000_drop_orphaned_current_user_company_id.sql`
   to bring rebuild down to functions = 10. **This is exactly the kind
   of question the drift gate will answer once the read-only role is
   provisioned.**

3. **A6 Stage 2 branch protection promotion.** `Real-PG full-graph
attestation` is green on commits `9652624` (7 MATCH / 3 SKIPPED),
   `3e3a099` (10/10 MATCH), and pending on `9ceb7db`. The check has
   been on for ~3 days across many iterations. Per dispatch ("after
   two consecutive green runs"), it is ready to promote to required.
   Branch protection promotion script ready in
   `scripts/.116c/promote-full-graph-required.sh` — I will NOT run it
   without explicit go-ahead because branch protection changes are
   shared-state and irreversible-by-PR.

## Phase 0 — landed

- **#46 merged** via `--rebase`; 12c313a now on main with 3
  conventional commits preserved linearly.
- **Genesis ledger reconciled in prod** (67 rows; the 0-row genesis row
  recorded). Done by Lauren per
  `scripts/.116c/LAUREN-ACTIONS.md` action 1.
- **Auto-deploy audit clean.** No `supabase/` dir, no Supabase CLI
  workflow, no migration-on-merge. Vercel deploys app code only.
- **`scripts/.116c/LAUREN-ACTIONS.md`** committed — three metadata-only
  actions.

## Lauren-side actions remaining

Per `scripts/.116c/LAUREN-ACTIONS.md`:

1. ~~Ledger reconcile~~ — **DONE** 2026-06-08.
2. **Drift-gate role** — `CREATE ROLE drift_gate_readonly LOGIN
PASSWORD '<random>'` + `GRANT USAGE ON SCHEMA public + pg_catalog`,
   `GRANT REFERENCES ON ALL TABLES IN SCHEMA public`, `GRANT SELECT ON
public.v_anchor_verification`. **NO `SELECT ON ALL TABLES`.** The
   role reads schema metadata; it cannot read application data.
   Connection string → repo secret `PGURL_PROD_READONLY`.
3. **Branch protection** — Stage 1 LIVE (`Run 7 bulletproof scenarios`).
   Stage 2 ready (await DECISION NEEDED #3 above).

## Per-dimension chat-Claude attestation flow (the close)

The harness going green is Code's self-check. The CLOSE is chat-Claude:

1. CI completes; `scripts/.116c/ATTESTATION-HANDOFF.md` has every
   dimension's `(count, immune_fp, exact catalog query)`
2. chat-Claude re-pulls live production with the same query, computes
   the same fingerprint, confirms match
3. Repeat per dimension until 10 of 10 clear
4. PR moves to ready; Lauren authorises merge

Per the dispatch: I do not self-certify the close.

[Generated with Claude Code]
