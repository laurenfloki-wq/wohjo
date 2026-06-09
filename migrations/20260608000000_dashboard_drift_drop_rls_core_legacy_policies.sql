-- Dashboard-drift correction — drops 17 legacy RLS policies from
-- 202604302100_rls_core_multi_tenant.sql that current production no
-- longer has.
--
-- Hunt outcome:
--   The substrate full-graph attestation surfaced a +17 policy delta on
--   7 core multi-tenant tables (companies, sites, workers, supervisors,
--   shifts, shift_events, exports). Per-table localisation showed every
--   extra corresponds 1:1 to a policy created by
--   202604302100_rls_core_multi_tenant.sql §3-§9 (and enumerated in
--   that file's own §10 verification block as "TOTAL = 17 policies").
--
-- Classification:
--   Class (b) — prod-side dashboard drop. A tracked migration created
--   them; production has since dropped all 17 via the Supabase dashboard
--   (or psql ad-hoc) without a corresponding migration. The drop was
--   most likely contemporaneous with the
--   20260507034128_phase_2_deploy_wave_2026_05_07_atomic_v2.sql
--   consolidation, which introduced the simpler
--   service_role_full_access + authenticated_select_own_company pair
--   that is what production retains today.
--
-- This migration represents that removal faithfully so the empty-DB
-- replay chain converges on the byte-exact current production state.
-- All DROPs are IF EXISTS — safe to apply against production where the
-- drops already happened.
--
-- public.current_user_company_id() is INTENTIONALLY left in place. It
-- is the only helper the now-dropped policies relied on; production
-- still carries it (functions count = 11 includes it). If production
-- has also dropped the function (drift gate will tell us), a follow-up
-- migration will remove it.

-- exports
DROP POLICY IF EXISTS exports_admin_select ON public.exports;

-- shift_events
DROP POLICY IF EXISTS shift_events_self_select ON public.shift_events;
DROP POLICY IF EXISTS shift_events_admin_select ON public.shift_events;

-- shifts
DROP POLICY IF EXISTS shifts_self_select ON public.shifts;
DROP POLICY IF EXISTS shifts_admin_select ON public.shifts;

-- supervisors
DROP POLICY IF EXISTS supervisors_self_select ON public.supervisors;
DROP POLICY IF EXISTS supervisors_admin_update ON public.supervisors;
DROP POLICY IF EXISTS supervisors_admin_insert ON public.supervisors;
DROP POLICY IF EXISTS supervisors_admin_select ON public.supervisors;

-- workers
DROP POLICY IF EXISTS workers_self_select ON public.workers;
DROP POLICY IF EXISTS workers_admin_update ON public.workers;
DROP POLICY IF EXISTS workers_admin_insert ON public.workers;
DROP POLICY IF EXISTS workers_admin_select ON public.workers;

-- sites
DROP POLICY IF EXISTS sites_admin_update ON public.sites;
DROP POLICY IF EXISTS sites_admin_insert ON public.sites;
DROP POLICY IF EXISTS sites_admin_select ON public.sites;

-- companies
DROP POLICY IF EXISTS companies_admin_select ON public.companies;
