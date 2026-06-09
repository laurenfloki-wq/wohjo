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

**Tighter privilege model (2026-06-09 dispatch):** the drift gate uses pg*catalog + pg_get**def functions only. pg*catalog is universally readable; pg_get**def resolves definitions from catalog OIDs without privileges on the target object. So the role needs CONNECT + USAGE on `public` only — and crucially, **no SELECT grants on any table or view**. This makes the negative PII test pass by construction.

The full role-creation SQL is in `scripts/.116c/drift-gate-role.sql` (commit, do not execute). The Lauren-side runbook (provisioning + chat-Claude audit handoff) is in `scripts/.116c/DRIFT-GATE-README.md`. Summary of what that script does:

```sql
create role drift_gate_ro with login password :'pw'
  nosuperuser nocreatedb nocreaterole noinherit;
grant connect on database postgres to drift_gate_ro;
grant usage on schema public to drift_gate_ro;
alter role drift_gate_ro set default_transaction_read_only = on;
-- deliberately NO 'grant select' on any table or view.
-- do NOT grant authenticated / service_role / postgres membership.
```

**Then add to GitHub repository secrets** (Settings → Secrets and variables → Actions → New repository secret):

- Name: `PGURL_PROD_READONLY` (exact case)
- Value: `postgres://drift_gate_ro:<password>@db.rwnxnnudljpgyfwbnosu.supabase.co:5432/postgres?sslmode=require`

The workflow checks for the secret presence and fails clearly if missing; it never runs blind.

**Have chat-Claude audit the role's effective privileges** before the gate goes live — the six audit queries are in `scripts/.116c/DRIFT-GATE-README.md` under "Hand off to chat-Claude for the privilege audit". The expected outcome of the negative PII test:

```sql
SELECT grantee, table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'drift_gate_ro';
-- Expected: 0 rows.
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
