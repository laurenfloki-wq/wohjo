# LAUREN-RUNBOOK — migration-ledger completeness (record-only)

**Model:** Claude verified everything below with read-only SELECTs against prod;
**Claude did not run any DDL/DML or INSERT.** This script is **record-only** — it
adds bookkeeping rows to `supabase_migrations.schema_migrations` for committed
migrations whose *effects are already in prod* but whose ledger row is missing.
**It re-executes no schema SQL.** Run it in the Supabase SQL editor as `postgres`
after reviewing.

> Verified against prod 2026-06-24: ledger contains `20260615080918` (widen) and
> `20260623012112` (harden_rls) already — so those are **no-ops** here (the
> `ON CONFLICT DO NOTHING` makes that safe). The genuinely-missing recent rows are
> `20260608000000` (dashboard_drift), `20260609000000` (count_broken_chain_links),
> and the new `20260623013000` (harden_rls forward-drop, added in this PR).

## The INSERT (review, then run)

```sql
BEGIN;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES
  -- dashboard_drift (CORRECTED to 11 drops + the function drop — see PR).
  ('20260608000000', 'dashboard_drift_drop_rls_core_legacy_policies',
   ARRAY[$stmt$
DROP POLICY IF EXISTS shift_events_self_select ON public.shift_events;
DROP POLICY IF EXISTS shifts_self_select ON public.shifts;
DROP POLICY IF EXISTS supervisors_self_select ON public.supervisors;
DROP POLICY IF EXISTS supervisors_admin_update ON public.supervisors;
DROP POLICY IF EXISTS supervisors_admin_insert ON public.supervisors;
DROP POLICY IF EXISTS workers_self_select ON public.workers;
DROP POLICY IF EXISTS workers_admin_update ON public.workers;
DROP POLICY IF EXISTS workers_admin_insert ON public.workers;
DROP POLICY IF EXISTS sites_admin_update ON public.sites;
DROP POLICY IF EXISTS sites_admin_insert ON public.sites;
DROP POLICY IF EXISTS companies_admin_select ON public.companies;
DROP FUNCTION IF EXISTS public.current_user_company_id();
$stmt$]::text[]),

  -- count_broken_chain_links (byte-identical to prod's definition).
  ('20260609000000', 'create_count_broken_chain_links',
   ARRAY[$stmt$
CREATE OR REPLACE FUNCTION public.count_broken_chain_links()
 RETURNS TABLE(n bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT count(*)::bigint AS n
  FROM shift_events s
  WHERE s.previous_event_hash IS NOT NULL
    AND s.previous_event_hash <> '0000000000000000000000000000000000000000000000000000000000000000'
    AND NOT EXISTS (
      SELECT 1 FROM shift_events p WHERE p.event_hash = s.previous_event_hash
    );
$function$;
$stmt$]::text[]),

  -- harden_rls forward-drop (captures the prod drop that greened the drift gate).
  ('20260623013000', 'drop_deny_all_internal_tables',
   ARRAY[$stmt$
drop policy if exists "deny_all_non_service" on public.notification_dead_letter;
drop policy if exists "deny_all_non_service" on public.wles_v1_watermark;
$stmt$]::text[]),

  -- widen — ALREADY in the ledger; included only so the set is complete. No-op.
  ('20260615080918', 'widen_shift_events_event_type_check_for_wles_v1',
   ARRAY[$stmt$-- already recorded; see migrations/20260615080918_*.sql$stmt$]::text[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
```

## Verify (after running)
```sql
SELECT version, name FROM supabase_migrations.schema_migrations
WHERE version IN ('20260608000000','20260609000000','20260623013000','20260615080918','20260623012112')
ORDER BY version;
-- EXPECT all five present.
```
Then confirm nothing changed in the actual schema (record-only): the drift gate
stays green and `count_broken_chain_links` / the policy set are unchanged.

---

## ⚠️ ADDITIONAL FINDING — pre-existing ledger gap (out of this task's scope; your call)
The completeness diff surfaced **more** unrecorded committed migrations than the
brief named — these **predate** the ledger (its earliest row is `20260506090427`)
and are a separate, larger backfill decision, so they are **NOT** in the INSERT
above:

- **16 early migrations** (Apr–early May 2026, 12-digit `YYYYMMDDHHMM` filenames):
  `202604220900_create_admins_table`, `202604220905_workers_user_id`,
  `202604221500_shifts_status_in_progress`, `202604221510_workers_primary_site_id`,
  `202604252100_worker_mfa_challenges`, `202604252200_worker_signin_anomaly`,
  `202604280930_shift_events_wles_v1`, `202604302100_rls_core_multi_tenant`,
  `202605010945_supervisors_add_created_at`, `202605011000_dispute_correction_phase1`,
  `202605011505_joao_row_canonical_hash`, `202605020900_atomic_provision_tenant`,
  `202605020920_atomic_founding_spot`, `202605020940_end_event_idempotency`,
  `202605051500_tenant_activity_mappings`, `202605090000_auth_events_substrate`.
  Their effects are clearly applied (the app runs on them); they were just never
  tracked in `schema_migrations`.
- **`A2-webhook-idempotency.sql`** — an **unversioned** migration file (no
  timestamp prefix), so it can't map to a ledger version. Needs renaming to a
  `<ts>_` form before it can be recorded.

Recommendation: a separate, dedicated backfill PR + runbook for the 16 early ones
(record-only, bodies from the committed files) and a rename for the unversioned
file — flagged here, not bundled, to keep this reconcile reviewable.
