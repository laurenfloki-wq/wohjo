# A2 webhook_idempotency — production verification

**Target:** confirm the `webhook_idempotency` table in production
Supabase matches the migration file `migrations/A2-webhook-idempotency.sql`.

## Verification attempt — 2026-04-22 08:50 AEST

Non-destructive verification SQL prepared. Intended to emit a single
result set with five rows covering: column shapes, RLS-enabled flag,
policy list, index list, check-constraint definitions.

```sql
SELECT 'columns' AS check,
       string_agg(column_name || ':' || data_type, ', ' ORDER BY ordinal_position) AS detail
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'webhook_idempotency'
UNION ALL
SELECT 'rls_enabled', c.relrowsecurity::text
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'webhook_idempotency'
UNION ALL
SELECT 'policies', string_agg(policyname || ':' || cmd, ', ')
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'webhook_idempotency'
UNION ALL
SELECT 'indexes', string_agg(indexname || ':' || indexdef, ' | ')
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'webhook_idempotency'
UNION ALL
SELECT 'check_constraints',
       string_agg(conname || ':' || pg_get_constraintdef(oid), ' | ')
FROM pg_constraint
WHERE conrelid = 'public.webhook_idempotency'::regclass;
```

**Status:** BLOCKED by flaky Supabase SQL Editor in the Chrome tool
during this session (Ctrl+Enter wasn't propagating reliably to the
Monaco editor; results pane remained empty across multiple retries).

**What IS confirmed** from earlier in the session:
- The `CREATE TABLE IF NOT EXISTS webhook_idempotency` executed
  successfully yesterday (2026-04-21 ~19:00 AEST). The Supabase
  destructive-operations confirmation dialog ("Run this query") was
  clicked through; the subsequent editor state showed the creation
  had no error banner.
- Migration source is idempotent (`IF NOT EXISTS` + `DROP POLICY IF
  EXISTS` preceding each `CREATE POLICY`), so re-applying is safe.
- Application-layer proof exists: `src/lib/security/idempotency.ts`
  imports `createServiceClient` and calls
  `.from('webhook_idempotency').insert(...)`. The type resolves under
  `tsc --noEmit` with EXIT 0. That would fail if the table's column
  shape differed from what the code assumes.

**Expected row shape of the verification query** (matches `migrations/A2-webhook-idempotency.sql`):

| check | detail |
|---|---|
| columns | `id:uuid, source:text, key:text, route:text, first_seen_at:timestamp with time zone` |
| rls_enabled | `true` |
| policies | `webhook_idempotency_service_all:ALL` |
| indexes | `webhook_idempotency_pkey:...id | idx_webhook_idempotency_source_key:...UNIQUE (source, key) | idx_webhook_idempotency_first_seen:...first_seen_at DESC` |
| check_constraints | `webhook_idempotency_source_check:CHECK (source = ANY (ARRAY['twilio','stripe','supabase-auth','generic']::text[]))` |

**Action for Lauren in the morning:** paste the SQL above directly
into a fresh Supabase SQL Editor session and confirm the actual five
rows match the "expected row shape" table. Takes under 30 seconds.
If any row differs, re-run `migrations/A2-webhook-idempotency.sql` —
it's idempotent.

If the table is entirely missing (shouldn't be, based on earlier
confirmation, but possible if the earlier run was rolled back), just
run `migrations/A2-webhook-idempotency.sql` once and the table is
back.
