# #116c — Full-graph bulletproof attestation

Status (2026-06-08): **draft / iteration in progress**. Stacked on #46 (genesis migration). Will rebase to main after #46 merges.

## Scope

#116b proved that the repo can rebuild **tables + columns + constraints** from empty. This PR widens that to the full schema graph — every dimension that production carries — verified on real Postgres 17, with drift caught automatically in CI.

The new dimensions:

| #   | Dimension        | Production count                                              | Method                                                                     | Reference file                          |
| --- | ---------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------- |
| 1   | RLS enable-state | 25 (all enabled, none forced)                                 | `pg_class.relrowsecurity`                                                  | `prod-rls-state.txt`                    |
| 2   | RLS policies     | 43                                                            | `pg_policies` (schema.table :: name :: cmd :: roles :: qual :: with_check) | `prod-policies.txt` (CI-generated)      |
| 3   | Indexes          | 97                                                            | `pg_get_indexdef`                                                          | `prod-indexes.txt` (CI-generated)       |
| 4   | Functions        | 11                                                            | `pg_get_functiondef` — REAL-PG ONLY                                        | `prod-functions-def.txt` (CI-generated) |
| 5   | Triggers         | 9                                                             | `pg_get_triggerdef` — REAL-PG ONLY                                         | `prod-triggers-def.txt` (CI-generated)  |
| 6   | Column defaults  | 78 (one lost to MCP truncation, in `prod-defaults.txt` is 77) | `pg_attrdef + pg_get_expr`                                                 | `prod-defaults.txt`                     |
| 7   | View body        | 1 (`v_anchor_verification`)                                   | `pg_get_viewdef` — REAL-PG ONLY                                            | `prod-view-body.txt` (CI-generated)     |
| 8   | Extensions       | 5                                                             | `pg_extension.extname`                                                     | `prod-extensions.txt`                   |
| 9   | Zero-asserts     | 0/0/0 (sequences/enums/domains)                               | catalog count                                                              | `prod-zero-asserts.txt`                 |

## How the gate works

`scripts/.116c/full-graph-attestation.mjs` connects to a Postgres 17 instance (CI service container or local Docker), drops `public`, recreates with shim + extensions, applies genesis + 85 reconciled migrations in order, then queries each dimension's catalog and computes the immune fingerprint:

```
md5(string_agg(md5(line), '' ORDER BY md5(line)))
```

The reference files in this directory hold production's canonical lines, sorted by `md5(line)` (the same ordering used in the fingerprint). Diff is line-by-line set comparison.

The CI workflow `.github/workflows/full-graph-attestation.yml` runs this on every PR/push to `main` against a `postgres:17` service container.

## What is committed vs CI-generated

**Committed now:** rls_state, defaults, extensions, zero_asserts — files small enough to ship by hand. Plus function and trigger NAME inventories (signatures, not bodies).

**Will be committed after first green CI run:** policies, indexes, function bodies, trigger bodies, view body. These come out of the harness verbatim from the real-PG rebuild that matches production. Once produced, chat-Claude attests them against live production; if they match, they get committed back as the durable references.

## Known limitations

1. **`supabase_vault` extension** is Supabase-managed and not available in vanilla postgres:17. The harness reports a count of 4 installed extensions (pg_stat_statements, pgcrypto, plpgsql, uuid-ossp) vs production's 5. This is documented and the gate accepts a 1-extension delta on `supabase_vault` specifically.

2. **`pg_stat_statements`** requires `shared_preload_libraries`; the CI service container's default config may not have it. The harness logs a warning and continues; the extensions diff may show a 2-extension delta until the CI container is reconfigured.

3. **Docker not available locally on Windows host.** Iteration happens via CI; local testing requires Docker Desktop running or a `postgres:17` install.

## Iteration loop

1. CI fails on dimension X with drift → diff is in the workflow artefacts (`rebuild-dimensions-<run-id>`).
2. Inspect the diff. Decide:
   - **Missing from rebuild** (dashboard-era object) → add to `migrations/00000000000000_genesis_pre_baseline_schema.sql`, or stamp a new forward-migration if the object is post-baseline and was applied via dashboard.
   - **Extra in rebuild** (migration created something prod doesn't have) → likely a deadweight Group P file; archive to `migrations/archive/`.
   - **Definition mismatch** (same object, different shape) → trace the migration that produced the rebuild shape and the one that should have. May indicate a missing forward migration.
3. Push fix, re-run CI.
4. When all 9 dimensions green, hand to chat-Claude for live-production attestation.

## Acceptance close (chat-Claude)

Per the dispatch, this PR doesn't self-certify. The close is chat-Claude pulling live production, computing each dimension's immune fingerprint with the formula above, and confirming match against the rebuild's committed reference files.
