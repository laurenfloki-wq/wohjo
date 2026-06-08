# Lauren-side actions for #116c full-graph bulletproof

Three actions, in order. Each is a metadata-only operation against production — none modifies application schema or data. Code cannot execute these per the boundary rules; surface here for your approval and execution.

## 1. Ledger reconcile: record genesis as applied (one-time, post-#46-merge)

**Why:** `migrations/00000000000000_genesis_pre_baseline_schema.sql` reconstructs the pre-baseline schema that production already has. Genesis is for empty-replay (the rebuild contract); production must _not_ re-apply it. To prevent any future `supabase db push` from trying, record it as already-applied in the ledger.

**Risk:** zero — metadata only. Adds one row to `supabase_migrations.schema_migrations`. Adds no objects, modifies no data, touches no application schema.

**Pick one path:**

### Path A — Direct SQL in the Supabase SQL editor (recommended)

```sql
-- Run as postgres (the SQL editor's default role) in project rwnxnnudljpgyfwbnosu
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES (
  '00000000000000',
  'genesis_pre_baseline_schema',
  ARRAY[]::text[]  -- empty body: this migration is repo-only, never applied to live
);
```

After running, verify:

```sql
SELECT version, name, array_length(statements, 1) AS stmt_count
FROM supabase_migrations.schema_migrations
WHERE version = '00000000000000';
-- Expected: 00000000000000 | genesis_pre_baseline_schema | NULL (empty array → NULL length)
```

### Path B — Supabase CLI (if you ever run `supabase migration repair`)

The repo has no `supabase/` directory today, so the CLI path needs `supabase init` first plus auth. Path A is simpler. If you go this route later:

```
supabase link --project-ref rwnxnnudljpgyfwbnosu
supabase migration repair --status applied 00000000000000
```

## 2. Drift-gate role + GitHub secret (one-time, before Phase 4 activates)

**Why:** `.github/workflows/drift-gate.yml` pulls live-prod fingerprints to compare against committed references. It needs a least-privilege Postgres role — never the service-role key.

**Important — the role MUST be able to read schema metadata WITHOUT row access to PII tables.** The dispatch flags a gotcha: `information_schema` filters by privilege; a zero-grant role sees nothing. The drift-gate script has been rewritten this commit to query `pg_catalog` ONLY (`pg_policy` instead of `pg_policies`, `pg_class WHERE relkind='S'` instead of `information_schema.sequences`). No SELECT on data tables required.

The minimum-privilege grant set:

```sql
-- run as postgres superuser in the live production database

-- 1. Create the login role
CREATE ROLE drift_gate_readonly LOGIN PASSWORD '<generate a strong random password>';

-- 2. Allow it to traverse public + catalogues
GRANT USAGE ON SCHEMA public TO drift_gate_readonly;
GRANT USAGE ON SCHEMA pg_catalog TO drift_gate_readonly;

-- 3. REFERENCES on application tables — gives catalog visibility (pg_attribute,
--    pg_attrdef, pg_index, pg_constraint, pg_trigger rows for those tables become
--    visible) WITHOUT granting any data access. The role cannot SELECT any rows.
GRANT REFERENCES ON ALL TABLES IN SCHEMA public TO drift_gate_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT REFERENCES ON TABLES TO drift_gate_readonly;

-- 4. SELECT on the one VIEW we need pg_get_viewdef on
GRANT SELECT ON public.v_anchor_verification TO drift_gate_readonly;

-- (No SELECT on application tables. The drift-gate harness queries
--  pg_policy directly for the policies dimension and pg_class for the
--  zero-asserts dimension. REFERENCES is sufficient for visibility into
--  pg_attribute/pg_attrdef/pg_index/pg_constraint/pg_trigger for the
--  application tables.)
```

The role cannot read any application data — no SELECT grants on any PII-bearing table. The single SELECT (on `v_anchor_verification`) is on a metadata view (substrate-anchor verification surface, no PII).

**Then add to GitHub repository secrets** (Settings → Secrets and variables → Actions → New repository secret):

- Name: `PGURL_PROD_READONLY`
- Value: `postgres://drift_gate_readonly:<password>@db.rwnxnnudljpgyfwbnosu.supabase.co:5432/postgres?sslmode=require`

The workflow checks for the secret presence and fails clearly if missing; it never runs blind.

**Have chat-Claude audit the role's effective privileges** before the gate goes live:

```sql
-- Run as superuser, paste output to chat-Claude
SELECT grantee, table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'drift_gate_readonly'
ORDER BY table_schema, table_name, privilege_type;
```

## 3. Branch protection — required status checks (post-convergence, GitHub Pro is on)

**Why:** Both gates run on every PR/push regardless of plan. Making them merge-blocking requires required-status-check configuration. Per the dispatch sequence, add only currently-green gates first, then add the rest as each clears.

**Stage 1 (do now, currently green):**

Repository → Settings → Branches → main → Branch protection rule:

- ✓ Require a pull request before merging
- ✓ Require status checks to pass before merging
- ✓ Require branches to be up to date before merging
- In the search box, tick exactly: **`Run 7 bulletproof scenarios`**

**Stage 2 (add after first green full-graph run on this commit):**

- Add: **`Real-PG full-graph attestation`**

**Stage 3 (add after drift gate has had a clean run with the role provisioned):**

- Add: **`Compare live prod vs committed rebuild references`** (the drift-gate job)

Avoid adding gates before they're green or you'll deadlock the next PR.
