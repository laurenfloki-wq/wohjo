# Day 3 P1 migration — verification status

**Context:** GAP-A3-001/002 Option B implementation requires two
migrations applied to prod Supabase before any route refactor can
safely land.

**Migration files on disk (ready to apply):**
- `migrations/202604220900_create_admins_table.sql` — new `admins`
  table, indexes, `updated_at` trigger, RLS with self-select + service-role-write policies.
- `migrations/202604220905_workers_user_id.sql` — `ALTER TABLE
  workers ADD COLUMN user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;`
  plus a partial index.

**What was attempted from this sandbox:**
1. The combined SQL for both migrations was pasted into the Chrome
   Supabase SQL Editor at `https://supabase.com/dashboard/project/rwnxnnudljpgyfwbnosu/sql/...`.
2. Run button clicked. The destructive-confirmation dialog that
   usually appears for `DROP POLICY IF EXISTS` either surfaced and
   was auto-handled or was bypassed — unable to deterministically
   confirm.
3. Verification SELECT dispatched; results pane remained empty across
   multiple retries.
4. Navigated to the Table Editor URL to visually confirm `admins`
   table presence; the dashboard page did not render (body size 0)
   through the Chrome tool during this session.

**Per Day 3 brief explicit stop rule:**
> Stop condition: if the destructive-confirmation dialog appears and
> you cannot deterministically verify success, log the SQL run, stop,
> and flag for Lauren to manually verify in a fresh read-only session.
> Do not proceed to code changes until verification is confirmed.

**Therefore:** P1 route refactor is DEFERRED until Lauren verifies.

## 30-second verification Lauren should run

Open a fresh Supabase SQL Editor session and run this exact read-only query:

```sql
SELECT
  'admins table'                AS check,
  (SELECT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='admins'))::text AS present
UNION ALL
SELECT 'admins.role CHECK',
  (SELECT EXISTS (SELECT 1 FROM information_schema.check_constraints
                  WHERE constraint_name LIKE '%admins_role_check%'))::text
UNION ALL
SELECT 'admins_rls_enabled',
  (SELECT relrowsecurity::text FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='admins')
UNION ALL
SELECT 'admins_policies_count',
  (SELECT count(*)::text FROM pg_policies WHERE schemaname='public' AND tablename='admins')
UNION ALL
SELECT 'workers.user_id column',
  (SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='workers' AND column_name='user_id'))::text
UNION ALL
SELECT 'workers.user_id UNIQUE',
  (SELECT EXISTS (SELECT 1 FROM information_schema.table_constraints
                  WHERE table_schema='public' AND table_name='workers' AND constraint_type='UNIQUE'))::text;
```

**Expected result (6 rows):**

| check | present |
|---|---|
| admins table | true |
| admins.role CHECK | true |
| admins_rls_enabled | true |
| admins_policies_count | 2 |
| workers.user_id column | true |
| workers.user_id UNIQUE | true |

## If any row is NOT as expected

Simply re-run the two migration files — both are idempotent
(`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
`DROP POLICY IF EXISTS` before `CREATE POLICY`, etc.):

```sql
-- Run the contents of migrations/202604220900_create_admins_table.sql
-- Then run the contents of migrations/202604220905_workers_user_id.sql
```

## After verification, the route-refactor work unblocks

Once Lauren confirms the six-row result matches, ping Cowork (or
manually proceed on the branch `feat/a3-001-002-closure`). The
route-refactor work is fully specified in `tests/cross-tenant/audit-A3-001.md`
(audit table shows each of the 14 routes + the precise change).
Helpers (`getCompanyIdForSession`, `requireCompanyMembership`,
`requireWorkerIdentity`) are queued up under `src/lib/auth/`
as follow-up commits tonight or first thing tomorrow.
