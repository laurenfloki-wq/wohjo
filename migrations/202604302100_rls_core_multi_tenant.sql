-- =====================================================================
-- RLS HARDENING — 7 core multi-tenant tables
-- Cowork-generated 2026-04-30 evening per overnight Task 6
-- LAUREN: review every line before running. Apply to staging clone first.
--
-- Background:
--   The dashboard scoping audit at
--   ~/Desktop/FLOSTRUCTION-Build/dashboard-scoping-audit-2026-04-30.md
--   identified that 7 core multi-tenant tables (companies, sites, workers,
--   supervisors, shifts, shift_events, exports) have NO RLS policies. The
--   codebase relies entirely on application-layer scoping via
--   getCompanyIdForSession() across 13 API routes + the dashboard server
--   component. That's single-layer defence.
--
--   This migration adds defence-in-depth at the database layer. With
--   RLS enabled, even if a future code path forgets the application-layer
--   scope, the database refuses to return rows from the wrong tenant.
--
-- Approach:
--   - ENABLE ROW LEVEL SECURITY on each of the 7 tables
--   - Create per-table SELECT/INSERT/UPDATE/DELETE policies for the
--     `authenticated` role that filter rows by company_id matching the
--     calling user's admins-table company_id (resolved via auth.uid())
--   - Service role (cron jobs, webhook handlers) bypasses RLS by default
--     when using SUPABASE_SERVICE_ROLE_KEY, so cross-tenant operational
--     paths continue to work without additional policies.
--
-- Pre-flight:
--   1. Apply this migration to the staging clone first
--   2. Run the existing test suite against staging — every passing test
--      MUST continue to pass with RLS active. If anything breaks, surface
--      to Cowork before applying to production.
--   3. Manually smoke-test /command/* surfaces with Lauren's session —
--      Workers/Sites/Supervisors/Approvals must continue to load. If
--      anything 404s or 500s, surface.
--   4. Only after staging passes, apply to production via `supabase db push`.
--
-- Hard rule:
--   Cowork does NOT auto-apply this. Lauren runs `supabase db push` on
--   staging first, then on production after verification.
--
-- Rollback path:
--   See §ROLLBACK at the bottom of this file. Each `ENABLE` is reversible
--   via `DISABLE ROW LEVEL SECURITY`.
-- =====================================================================


-- =====================================================================
-- §1  HELPER FUNCTION — current_user_company_id()
-- =====================================================================
-- Resolves the calling user's company_id via the admins table. Used by
-- every per-table policy below.
--
-- SECURITY DEFINER + locked search_path defends against schema injection
-- (per Supabase RLS best practice).

CREATE OR REPLACE FUNCTION public.current_user_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
  FROM admins
  WHERE user_id = auth.uid()
  LIMIT 1
$$;

-- Allow authenticated role to call the function. Service role bypasses
-- this whole RLS layer; this grant is just for the authenticated user
-- session that hits /command/* surfaces.
GRANT EXECUTE ON FUNCTION public.current_user_company_id() TO authenticated;


-- =====================================================================
-- §2  ENABLE RLS ON 7 CORE TABLES
-- =====================================================================

ALTER TABLE companies     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites         ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisors   ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE exports       ENABLE ROW LEVEL SECURITY;


-- =====================================================================
-- §3  POLICIES — companies
-- =====================================================================
-- Admin can SELECT only their own company.

DROP POLICY IF EXISTS companies_admin_select ON companies;
CREATE POLICY companies_admin_select
  ON companies
  FOR SELECT
  TO authenticated
  USING (id = public.current_user_company_id());

-- INSERT/UPDATE/DELETE are NOT exposed to the authenticated role — those
-- mutations go through service role from API routes (admin-bootstrap,
-- onboarding webhook). Default-deny for authenticated.


-- =====================================================================
-- §4  POLICIES — sites
-- =====================================================================

DROP POLICY IF EXISTS sites_admin_select ON sites;
CREATE POLICY sites_admin_select
  ON sites
  FOR SELECT
  TO authenticated
  USING (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS sites_admin_insert ON sites;
CREATE POLICY sites_admin_insert
  ON sites
  FOR INSERT
  TO authenticated
  WITH CHECK (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS sites_admin_update ON sites;
CREATE POLICY sites_admin_update
  ON sites
  FOR UPDATE
  TO authenticated
  USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());

-- DELETE not exposed; deactivation is is_active = false (status change,
-- not row removal — per CLAUDE.md rule #6 "no data is ever deleted").


-- =====================================================================
-- §5  POLICIES — workers
-- =====================================================================

DROP POLICY IF EXISTS workers_admin_select ON workers;
CREATE POLICY workers_admin_select
  ON workers
  FOR SELECT
  TO authenticated
  USING (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS workers_admin_insert ON workers;
CREATE POLICY workers_admin_insert
  ON workers
  FOR INSERT
  TO authenticated
  WITH CHECK (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS workers_admin_update ON workers;
CREATE POLICY workers_admin_update
  ON workers
  FOR UPDATE
  TO authenticated
  USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());

-- Workers also need self-SELECT (worker app /field reads its own row).
-- The /field PWA goes through requireWorkerIdentity which uses
-- service role, so this isn't strictly needed; but adding for
-- defence-in-depth.
DROP POLICY IF EXISTS workers_self_select ON workers;
CREATE POLICY workers_self_select
  ON workers
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());


-- =====================================================================
-- §6  POLICIES — supervisors
-- =====================================================================

DROP POLICY IF EXISTS supervisors_admin_select ON supervisors;
CREATE POLICY supervisors_admin_select
  ON supervisors
  FOR SELECT
  TO authenticated
  USING (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS supervisors_admin_insert ON supervisors;
CREATE POLICY supervisors_admin_insert
  ON supervisors
  FOR INSERT
  TO authenticated
  WITH CHECK (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS supervisors_admin_update ON supervisors;
CREATE POLICY supervisors_admin_update
  ON supervisors
  FOR UPDATE
  TO authenticated
  USING (company_id = public.current_user_company_id())
  WITH CHECK (company_id = public.current_user_company_id());

-- Supervisor self-SELECT (supervisor portal /verify reads its own row).
-- The /verify route uses supervisor-token auth (not Supabase Auth),
-- so this policy isn't strictly used; defence-in-depth only.
DROP POLICY IF EXISTS supervisors_self_select ON supervisors;
CREATE POLICY supervisors_self_select
  ON supervisors
  FOR SELECT
  TO authenticated
  USING (supabase_user_id = auth.uid());


-- =====================================================================
-- §7  POLICIES — shifts
-- =====================================================================

DROP POLICY IF EXISTS shifts_admin_select ON shifts;
CREATE POLICY shifts_admin_select
  ON shifts
  FOR SELECT
  TO authenticated
  USING (company_id = public.current_user_company_id());

-- Workers can SELECT their own shifts.
DROP POLICY IF EXISTS shifts_self_select ON shifts;
CREATE POLICY shifts_self_select
  ON shifts
  FOR SELECT
  TO authenticated
  USING (
    worker_id IN (
      SELECT id FROM workers WHERE user_id = auth.uid()
    )
  );

-- INSERT goes through service role from /api/field/shift/start. No
-- authenticated INSERT policy.

-- UPDATE goes through service role for status transitions (SUBMITTED →
-- SUPERVISOR_APPROVED → PAYROLL_APPROVED → EXPORTED). No authenticated
-- UPDATE policy.


-- =====================================================================
-- §8  POLICIES — shift_events (WLES heart, immutable)
-- =====================================================================
-- shift_events are append-only per CLAUDE.md rule #6. SELECT only.
-- Service role does INSERT from /api/field/shift/start and /api/field/shift/end.

DROP POLICY IF EXISTS shift_events_admin_select ON shift_events;
CREATE POLICY shift_events_admin_select
  ON shift_events
  FOR SELECT
  TO authenticated
  USING (company_id = public.current_user_company_id());

DROP POLICY IF EXISTS shift_events_self_select ON shift_events;
CREATE POLICY shift_events_self_select
  ON shift_events
  FOR SELECT
  TO authenticated
  USING (
    worker_id IN (
      SELECT id FROM workers WHERE user_id = auth.uid()
    )
  );


-- =====================================================================
-- §9  POLICIES — exports
-- =====================================================================

DROP POLICY IF EXISTS exports_admin_select ON exports;
CREATE POLICY exports_admin_select
  ON exports
  FOR SELECT
  TO authenticated
  USING (company_id = public.current_user_company_id());

-- INSERT goes through service role from /api/command/export. No
-- authenticated INSERT policy.


-- =====================================================================
-- §10  VERIFICATION QUERIES
-- =====================================================================
-- Run after applying. All should succeed without errors.

-- 1. RLS confirmed enabled on all 7 tables:
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relname IN ('companies', 'sites', 'workers', 'supervisors',
                  'shifts', 'shift_events', 'exports')
  AND relnamespace = 'public'::regnamespace
ORDER BY relname;
-- Expected: rls_enabled = true on all 7 rows.

-- 2. Helper function exists and has correct security:
SELECT proname AS function_name,
       prosecdef AS is_security_definer
FROM pg_proc
WHERE proname = 'current_user_company_id'
  AND pronamespace = 'public'::regnamespace;
-- Expected: 1 row, is_security_definer = true.

-- 3. Policies counted per table:
SELECT schemaname, tablename, COUNT(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('companies', 'sites', 'workers', 'supervisors',
                    'shifts', 'shift_events', 'exports')
GROUP BY schemaname, tablename
ORDER BY tablename;
-- Expected counts:
--   companies     1 (select)
--   sites         3 (select, insert, update)
--   workers       4 (admin: select, insert, update + self-select)
--   supervisors   4 (admin: select, insert, update + self-select)
--   shifts        2 (admin select, self select)
--   shift_events  2 (admin select, self select)
--   exports       1 (admin select)
-- TOTAL = 17 policies


-- =====================================================================
-- §ROLLBACK — undo if production smoke tests fail
-- =====================================================================
-- Run sections in reverse order:

-- DROP POLICY IF EXISTS exports_admin_select ON exports;
-- ALTER TABLE exports DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS shift_events_self_select ON shift_events;
-- DROP POLICY IF EXISTS shift_events_admin_select ON shift_events;
-- ALTER TABLE shift_events DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS shifts_self_select ON shifts;
-- DROP POLICY IF EXISTS shifts_admin_select ON shifts;
-- ALTER TABLE shifts DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS supervisors_self_select ON supervisors;
-- DROP POLICY IF EXISTS supervisors_admin_update ON supervisors;
-- DROP POLICY IF EXISTS supervisors_admin_insert ON supervisors;
-- DROP POLICY IF EXISTS supervisors_admin_select ON supervisors;
-- ALTER TABLE supervisors DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS workers_self_select ON workers;
-- DROP POLICY IF EXISTS workers_admin_update ON workers;
-- DROP POLICY IF EXISTS workers_admin_insert ON workers;
-- DROP POLICY IF EXISTS workers_admin_select ON workers;
-- ALTER TABLE workers DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS sites_admin_update ON sites;
-- DROP POLICY IF EXISTS sites_admin_insert ON sites;
-- DROP POLICY IF EXISTS sites_admin_select ON sites;
-- ALTER TABLE sites DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS companies_admin_select ON companies;
-- ALTER TABLE companies DISABLE ROW LEVEL SECURITY;
-- DROP FUNCTION IF EXISTS public.current_user_company_id();
