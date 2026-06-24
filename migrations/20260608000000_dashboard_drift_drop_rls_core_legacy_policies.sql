-- Dashboard-drift correction — drops the legacy RLS policies from
-- 202604302100_rls_core_multi_tenant.sql that current production no longer has.
--
-- *** CORRECTED 2026-06-24 (verify-first ledger reconcile). ***
-- The original file dropped all 17 policies created by §3-§9 of
-- 202604302100, asserting prod had dropped all 17. A live check of prod
-- (pg_policy, 2026-06-24) found that is FALSE: only 11 are gone. SIX
-- `*_admin_select` policies are still present AND load-bearing — they are the
-- SOLE company-scoped SELECT path for admins (role `authenticated`); the only
-- other policy on each table is `service_role_full_access` (service-role only).
-- There is NO `authenticated_select_own_company` replacement (the original
-- narrative was wrong). A clean replay that dropped them would strip live admin
-- read access. So this migration now drops ONLY the 11 that prod actually
-- dropped, and RETAINS the 6 admin_select policies. They are part of the live
-- policies set (count 46) that the drift reference already pins.
--
-- The 6 retained (still present in prod, do NOT drop):
--   exports_admin_select, shift_events_admin_select, shifts_admin_select,
--   supervisors_admin_select, workers_admin_select, sites_admin_select
--   — each: PERMISSIVE FOR SELECT TO authenticated USING
--     (company_id IN (SELECT company_id FROM admins WHERE user_id = auth.uid())).
--
-- All DROPs are IF EXISTS — safe against prod where the 11 drops already
-- happened (no-op), and a clean empty-DB replay converges on the current prod
-- state (the 6 admin_select policies survive).
--
-- public.current_user_company_id() is also dropped: chat-Claude's per-function
-- attestation (2026-06-09) showed it is NOT in production's function set, and the
-- 6 retained policies do not call it (they use an inline admins subquery), so it
-- is a genuine orphan. DROP IF EXISTS — no-op in prod (already gone).

-- shift_events  (drop self_select; KEEP shift_events_admin_select)
DROP POLICY IF EXISTS shift_events_self_select ON public.shift_events;

-- shifts  (drop self_select; KEEP shifts_admin_select)
DROP POLICY IF EXISTS shifts_self_select ON public.shifts;

-- supervisors  (drop self_select + admin_update/insert; KEEP supervisors_admin_select)
DROP POLICY IF EXISTS supervisors_self_select ON public.supervisors;
DROP POLICY IF EXISTS supervisors_admin_update ON public.supervisors;
DROP POLICY IF EXISTS supervisors_admin_insert ON public.supervisors;

-- workers  (drop self_select + admin_update/insert; KEEP workers_admin_select)
DROP POLICY IF EXISTS workers_self_select ON public.workers;
DROP POLICY IF EXISTS workers_admin_update ON public.workers;
DROP POLICY IF EXISTS workers_admin_insert ON public.workers;

-- sites  (drop admin_update/insert; KEEP sites_admin_select)
DROP POLICY IF EXISTS sites_admin_update ON public.sites;
DROP POLICY IF EXISTS sites_admin_insert ON public.sites;

-- companies  (companies_admin_select is gone in prod)
DROP POLICY IF EXISTS companies_admin_select ON public.companies;

-- helper function (orphan after the 11 drops; not called by the 6 retained policies)
DROP FUNCTION IF EXISTS public.current_user_company_id();
