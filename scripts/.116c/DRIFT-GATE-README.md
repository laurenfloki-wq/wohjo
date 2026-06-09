# Drift gate — Lauren's runbook

## What it is

The drift gate (`scripts/.116c/drift-gate.mjs`,
`.github/workflows/drift-gate.yml`) is the second half of the substrate
integrity contract:

- **Full-graph attestation** (already required on main): proves
  _rebuild ≡ committed references_. Empty Postgres + genesis + 87
  migrations produces the same 10 fingerprints the references hold.
- **Drift gate** (this runbook): proves
  _committed references ≡ live production_. The 10 fingerprints in
  `scripts/.116c/prod-*.txt` equal the fingerprints live production
  emits today.

Together they close the chain: empty + migrations == committed == live.

The gate runs hourly + on-demand + on every PR that touches
`migrations/`, `scripts/.116c/`, or `.github/workflows/drift-gate.yml`.
It stays INACTIVE (fails clearly with "secret not set") until you
provision `PGURL_PROD_READONLY`.

## Stage 3 activation — your three actions

These are metadata-only on the production side. They do not write to
any application table. Code does not execute any of them.

### 1. Run the role-creation SQL

File: `scripts/.116c/drift-gate-role.sql`

Open the Supabase SQL editor for project `rwnxnnudljpgyfwbnosu`. Generate
a strong random password (`openssl rand -base64 32`) and substitute for
`:'pw'` in the script. Run the script as the `postgres` role.

The script creates `drift_gate_ro` with:

- `LOGIN PASSWORD '<your_pw>'`
- `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`
- `GRANT CONNECT ON DATABASE postgres`
- `GRANT USAGE ON SCHEMA public`
- `ALTER ROLE ... SET default_transaction_read_only = on`

**No** `GRANT SELECT` on any table or view. **No** membership in
`authenticated`, `service_role`, or `postgres`. The role can read
`pg_catalog` (universally available) and call `pg_get_*def` functions
to recompute fingerprints. It cannot read a single application row.

Self-verify on the same SQL editor session — both queries at the bottom
of `drift-gate-role.sql` must return zero rows. If either returns >0,
something has granted a SELECT or a role membership; stop and audit
before continuing.

### 2. Provision the GitHub Actions secret

Build the connection string:

```
postgres://drift_gate_ro:<password>@db.rwnxnnudljpgyfwbnosu.supabase.co:5432/postgres?sslmode=require
```

GitHub repo → Settings → Secrets and variables → Actions → New
repository secret:

- **Name:** `PGURL_PROD_READONLY` (exact case, no variation)
- **Value:** the connection string above

The workflow at `.github/workflows/drift-gate.yml` reads this secret
via `${{ secrets.PGURL_PROD_READONLY }}`. The "Verify PGURL_PROD_READONLY
secret is set" step fails cleanly with a pointer to this README if the
secret is missing.

### 3. Hand off to chat-Claude for the privilege audit

Before the gate is switched live, chat-Claude should attest that the
role has the privileges we expect and nothing more. The audit
queries — paste into the SQL editor against production:

```sql
-- A. Role attributes (super/createdb/createrole flags + login + inherit)
SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
       rolcanlogin, rolreplication, rolbypassrls
FROM pg_roles
WHERE rolname = 'drift_gate_ro';
-- Expected: super=f, inherit=f, createrole=f, createdb=f, canlogin=t,
--           replication=f, bypassrls=f

-- B. Default-transaction read-only setting (belt and braces)
SELECT rolname, unnest(rolconfig) AS conf
FROM pg_roles
WHERE rolname = 'drift_gate_ro';
-- Expected: a 'default_transaction_read_only=on' row

-- C. Direct table grants (PII negative test — must be zero rows)
SELECT grantee, table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'drift_gate_ro';
-- Expected: 0 rows

-- D. Role memberships (must be zero — role is islanded)
SELECT r.rolname AS member_of
FROM pg_auth_members m
JOIN pg_roles r ON r.oid = m.roleid
WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname = 'drift_gate_ro');
-- Expected: 0 rows

-- E. Database-level privileges
SELECT datname, datacl FROM pg_database WHERE datname = 'postgres';
-- The role should appear in datacl with 'c' (connect) and nothing more.

-- F. Schema-level privileges
SELECT nspname, nspacl FROM pg_namespace WHERE nspname = 'public';
-- The role should appear with 'U' (usage) and nothing more.
```

If chat-Claude confirms each query meets its expected outcome, the
role is least-privilege-correct and the gate can be switched live.

### 4. Flip the gate on

Once the secret exists and chat-Claude has cleared the audit:

- The hourly schedule fires automatically. The next run should report
  "All dimensions in sync" against the committed references.
- Run an on-demand `workflow_dispatch` to validate immediately.
- Inspect the run log; if it reports DRIFT, examine
  `scripts/.116c/drift-*.txt` artefacts (uploaded on failure).

### 5. Promote to required status check (Stage 3 branch protection)

After at least two consecutive green scheduled runs and chat-Claude's
audit clearance, Code can promote `Compare live prod vs committed
rebuild references` to a required status check on `main` —
**after your explicit go-ahead**. Branch protection is shared-state,
not pre-authorised.

## When the drift gate fails

A drift-gate failure means one of:

1. Production was modified outside committed migrations (this is the
   #116 failure mode the gate exists to catch). Inspect the diff
   artefact, identify the change, decide: write a faithful forward
   migration to reflect the change, or revert the production-side edit.
2. A reference file was edited locally without an accompanying
   production change. Inspect the PR that touched `scripts/.116c/`;
   roll back to the prior known-good reference.
3. The `supabase_vault` positive assertion failed — production has
   lost the platform extension. Surface to Supabase support.

For 1 and 2, the next step is always a tracked migration or reference
update — never a production write to "match" the reference.

## Files

| Path                                 | Purpose                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/.116c/drift-gate.mjs`       | The harness. Pulls live-prod fingerprints via pg_catalog only, diffs against committed references.                                                |
| `scripts/.116c/drift-gate-role.sql`  | The SQL Lauren runs once. Idempotent — `CREATE ROLE` will fail if the role exists; that is the safer error, do not change to `CREATE OR REPLACE`. |
| `scripts/.116c/DRIFT-GATE-README.md` | This document.                                                                                                                                    |
| `.github/workflows/drift-gate.yml`   | The CI workflow consuming `PGURL_PROD_READONLY`.                                                                                                  |
| `scripts/.116c/prod-*.txt`           | The 10 reference files the gate compares against.                                                                                                 |
