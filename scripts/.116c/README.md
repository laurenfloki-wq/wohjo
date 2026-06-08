# #116c — Full-graph bulletproof attestation

Status (2026-06-08): **draft / iteration in progress**. Stacked on #46 (genesis migration). Rebases to main when #46 merges.

## Scope (sharp)

**In scope:** the application schema in the `public` namespace of FLOSTRUCTION's Supabase Postgres. Every dimension of that schema — relations, columns, defaults, generated columns, constraints, RLS enable-state, policies, indexes, functions, triggers, the view body — must rebuild byte-for-byte from `empty + extensions + shim + genesis + 85 reconciled migrations`.

**Out of scope (by definition, not exception):** the Supabase platform — the `auth`, `storage`, `vault`, `realtime`, `graphql`, `pgbouncer`, `extensions` schemas and the roles/grants they provision. Those are platform-provided and managed outside our migration chain. The harness uses the official `supabase/postgres` image so they exist with the same shapes production sees, but they are not part of the rebuild-from-empty contract.

This scope is a definition, not a delta or an exception. There are no asterisks on the application-schema close.

## #116b proved 3 dimensions. #116c proves the remaining 9.

| #   | Dimension         | Production count                   | Catalog                                         | Reference file                          |
| --- | ----------------- | ---------------------------------- | ----------------------------------------------- | --------------------------------------- |
| 1   | RLS enable-state  | 25 (all enabled, none forced)      | `pg_class.relrowsecurity / relforcerowsecurity` | `prod-rls-state.txt`                    |
| 2   | RLS policies      | 43                                 | `pg_policies`                                   | `prod-policies.txt` (CI-generated)      |
| 3   | Indexes           | 97                                 | `pg_get_indexdef`                               | `prod-indexes.txt` (CI-generated)       |
| 4   | Functions         | 11                                 | `pg_get_functiondef` — real-PG only             | `prod-functions-def.txt` (CI-generated) |
| 5   | Triggers          | 9                                  | `pg_get_triggerdef` — real-PG only              | `prod-triggers-def.txt` (CI-generated)  |
| 6   | Column defaults   | 77                                 | `pg_attrdef` where `attgenerated=''`            | `prod-defaults.txt`                     |
| 7   | Generated columns | 1 (`companies.abn_digits`)         | `pg_attrdef` where `attgenerated='s'`           | `prod-generated-columns.txt`            |
| 8   | View body         | 1 (`v_anchor_verification`)        | `pg_get_viewdef` — real-PG only                 | `prod-view-body.txt` (CI-generated)     |
| 9   | Extensions        | 5                                  | `pg_extension.extname`                          | `prod-extensions.txt`                   |
| –   | Zero-asserts      | 0 / 0 / 0 (seqs / enums / domains) | catalog count                                   | `prod-zero-asserts.txt`                 |

Defaults and generated columns are split sub-dimensions. The canonical line carries the marker (`:DEFAULT:` or `:STORED:`) so a regular default can never silently match a generated expression. `companies.abn_digits` is the only generated column today; the split is in place so any future generated column gets stamped explicitly, not folded into "defaults".

## How the gate works

`scripts/.116c/full-graph-attestation.mjs` connects to `PGURL`, drops/recreates `public`, installs the 5 extensions (pgcrypto, uuid-ossp, pg_stat_statements, plpgsql, supabase_vault), applies the auth/storage stub + genesis + 85 reconciled migrations in order, then queries each dimension's catalog and computes the immune fingerprint:

```
md5(string_agg(md5(line), '' ORDER BY md5(line)))
```

Per-line md5 first (fixed-width hex, collation-immune), sorted bytewise, concatenated without separator, then md5'd. Same formula as #116b — engine-agnostic; matches across Postgres locales.

The CI workflow `.github/workflows/full-graph-attestation.yml` runs this on every PR/push to `main` against a `supabase/postgres:17.4.1.054` service container — the actual deployment target, not vanilla.

## What is committed vs CI-generated

**Committed now:** rls_state, defaults (77), generated_columns (1), extensions, zero_asserts, function inventory (names+args+lang+secdef), trigger inventory (names per table). Files small enough to ship by hand from the production reference pull.

**Will be committed after the first matching CI run:** policies (43 full defs), indexes (97 `pg_get_indexdef`), function bodies (11 `pg_get_functiondef`), trigger bodies (9 `pg_get_triggerdef`), view body (1 `pg_get_viewdef`). These come out of the harness verbatim from the real-PG rebuild that matches production. Once produced, chat-Claude attests them against live production; if they match, they get committed back as the durable references.

## Drift gate (Phase 5)

`scripts/.116c/drift-gate.mjs` + `.github/workflows/drift-gate.yml` — pulls the same 9 dimensions from **live production** (via the `PGURL_PROD_READONLY` repository secret) and compares to the committed references. Runs on schedule (hourly), on demand, and on every PR that touches `migrations/`, `scripts/.116c/`, or the gate itself.

The full-graph-attestation gate proves `rebuild == committed`. The drift gate proves `committed == live`. Together they pin the chain `empty + migrations == committed == live` — and break it loud the moment any link slips.

### Drift gate role provisioning (Lauren-side action)

The drift gate cannot run until a read-only role exists in production and its connection string is added as a repository secret. **The service-role key is FAR too powerful for a read check.** Provision a least-privilege role:

```sql
-- run as postgres superuser in the live production database
CREATE ROLE drift_gate_readonly LOGIN PASSWORD '<generate a strong random password>';

GRANT USAGE ON SCHEMA public TO drift_gate_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO drift_gate_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO drift_gate_readonly;

-- Allow reading catalogue views the harness queries
GRANT USAGE ON SCHEMA information_schema TO drift_gate_readonly;
GRANT USAGE ON SCHEMA pg_catalog TO drift_gate_readonly;
-- pg_policies, pg_get_*def, pg_extension all require only USAGE on pg_catalog
```

Then add to GitHub repository secrets as `PGURL_PROD_READONLY`:

```
postgres://drift_gate_readonly:<password>@db.rwnxnnudljpgyfwbnosu.supabase.co:5432/postgres?sslmode=require
```

The workflow checks for the secret and fails clearly if missing; it never runs without it.

## Iteration loop

1. CI fails on dimension X with drift → diff in workflow artefacts (`rebuild-dimensions-<run-id>` for the attestation gate; `drift-gate-<run-id>` for the drift gate).
2. For each missing line: trace to its origin.
   - **Missing in rebuild, present in prod** — dashboard-era object or migration that exists in production but not in the repo. Fold into genesis (if pre-baseline) or stamp a new forward migration (if post-baseline). Get chat-Claude to verify the prod source.
   - **Extra in rebuild, absent in prod** — a Group P file or migration that created something prod doesn't have. Likely deadweight to archive to `migrations/archive/`.
   - **Same line, different shape** — definitional mismatch. Trace which migration produced what.
3. Push fix → re-run CI.
4. When all 9 dimensions match, hand to chat-Claude for the live-production cross-check.

## Acceptance close (chat-Claude)

The PR does not self-certify. The close per the dispatch: chat-Claude pulls live production via her own connector, computes each dimension's immune fingerprint with the formula above, and confirms match against the rebuild's committed references — same flow as the #116b three. The harness going green is Code's self-check; chat-Claude's live-prod confirmation is the close. #47 does not move to ready until every dimension clears.

## Branch protection — Lauren-side action, plan-gated

Both `full-graph-attestation.yml` and `drift-gate.yml` run on every PR/push to `main` regardless of plan. To make them merge-blocking (the difference between "visible" and "bulletproof"), the repo needs GitHub Pro and the two checks must be added to `main`'s required status checks. Pro is a purchase, not Code's to action. Until then the gates produce signals but cannot block.
