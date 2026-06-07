-- crack_206_rls_initplan_optimize
-- Rewrite 21 RLS policies: wrap auth.uid(), auth.role(), auth.jwt() with (select ...)
-- so they evaluate once per query instead of once per row. Per Supabase advisor 0003.
-- Logic preserved exactly; only the function-call wrapping changes.

-- admin_access_log
DROP POLICY IF EXISTS admin_access_log_service_select ON public.admin_access_log;
CREATE POLICY admin_access_log_service_select ON public.admin_access_log
  FOR SELECT
  USING ((select auth.role()) = 'service_role'::text);

DROP POLICY IF EXISTS admin_access_log_service_insert ON public.admin_access_log;
CREATE POLICY admin_access_log_service_insert ON public.admin_access_log
  FOR INSERT
  WITH CHECK ((select auth.role()) = 'service_role'::text);

-- admins
DROP POLICY IF EXISTS admins_self_select ON public.admins;
CREATE POLICY admins_self_select ON public.admins
  FOR SELECT
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS admins_service_write ON public.admins;
CREATE POLICY admins_service_write ON public.admins
  FOR ALL
  USING ((select auth.role()) = 'service_role'::text)
  WITH CHECK ((select auth.role()) = 'service_role'::text);

-- auth_events
DROP POLICY IF EXISTS auth_events_self_select ON public.auth_events;
CREATE POLICY auth_events_self_select ON public.auth_events
  FOR SELECT TO authenticated
  USING (actor_user_id = (select auth.uid()));

DROP POLICY IF EXISTS auth_events_company_admin_select ON public.auth_events;
CREATE POLICY auth_events_company_admin_select ON public.auth_events
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT admins.company_id FROM admins
      WHERE admins.user_id = (select auth.uid())
    )
  );

-- companies
DROP POLICY IF EXISTS authenticated_select_own_company ON public.companies;
CREATE POLICY authenticated_select_own_company ON public.companies
  FOR SELECT TO authenticated
  USING (id = ((((select auth.jwt()) -> 'app_metadata'::text) ->> 'company_id'::text))::uuid);

-- exports
DROP POLICY IF EXISTS authenticated_select_own_company ON public.exports;
CREATE POLICY authenticated_select_own_company ON public.exports
  FOR SELECT TO authenticated
  USING (company_id = ((((select auth.jwt()) -> 'app_metadata'::text) ->> 'company_id'::text))::uuid);

-- geofence_events
DROP POLICY IF EXISTS authenticated_select_own_company ON public.geofence_events;
CREATE POLICY authenticated_select_own_company ON public.geofence_events
  FOR SELECT TO authenticated
  USING (company_id = ((((select auth.jwt()) -> 'app_metadata'::text) ->> 'company_id'::text))::uuid);

-- shift_events
DROP POLICY IF EXISTS authenticated_select_own_company ON public.shift_events;
CREATE POLICY authenticated_select_own_company ON public.shift_events
  FOR SELECT TO authenticated
  USING (company_id = ((((select auth.jwt()) -> 'app_metadata'::text) ->> 'company_id'::text))::uuid);

-- shifts
DROP POLICY IF EXISTS authenticated_select_own_company ON public.shifts;
CREATE POLICY authenticated_select_own_company ON public.shifts
  FOR SELECT TO authenticated
  USING (company_id = ((((select auth.jwt()) -> 'app_metadata'::text) ->> 'company_id'::text))::uuid);

-- sites
DROP POLICY IF EXISTS authenticated_select_own_company ON public.sites;
CREATE POLICY authenticated_select_own_company ON public.sites
  FOR SELECT TO authenticated
  USING (company_id = ((((select auth.jwt()) -> 'app_metadata'::text) ->> 'company_id'::text))::uuid);

-- supervisors
DROP POLICY IF EXISTS authenticated_select_own_company ON public.supervisors;
CREATE POLICY authenticated_select_own_company ON public.supervisors
  FOR SELECT TO authenticated
  USING (company_id = ((((select auth.jwt()) -> 'app_metadata'::text) ->> 'company_id'::text))::uuid);

-- tenant_activity_mappings
DROP POLICY IF EXISTS tenant_activity_mappings_service_all ON public.tenant_activity_mappings;
CREATE POLICY tenant_activity_mappings_service_all ON public.tenant_activity_mappings
  FOR ALL
  USING ((select auth.role()) = 'service_role'::text)
  WITH CHECK ((select auth.role()) = 'service_role'::text);

-- webhook_idempotency
DROP POLICY IF EXISTS webhook_idempotency_service_all ON public.webhook_idempotency;
CREATE POLICY webhook_idempotency_service_all ON public.webhook_idempotency
  FOR ALL
  USING ((select auth.role()) = 'service_role'::text)
  WITH CHECK ((select auth.role()) = 'service_role'::text);

-- worker_device_fingerprints
DROP POLICY IF EXISTS worker_device_fp_self_select ON public.worker_device_fingerprints;
CREATE POLICY worker_device_fp_self_select ON public.worker_device_fingerprints
  FOR SELECT TO authenticated
  USING (
    worker_id IN (
      SELECT workers.id FROM workers
      WHERE workers.user_id = (select auth.uid())
    )
  );

-- worker_mfa_challenges
DROP POLICY IF EXISTS worker_mfa_challenges_self_select ON public.worker_mfa_challenges;
CREATE POLICY worker_mfa_challenges_self_select ON public.worker_mfa_challenges
  FOR SELECT TO authenticated
  USING (
    worker_id IN (
      SELECT workers.id FROM workers
      WHERE workers.user_id = (select auth.uid())
    )
  );

-- worker_mfa_grants
DROP POLICY IF EXISTS worker_mfa_grants_self_select ON public.worker_mfa_grants;
CREATE POLICY worker_mfa_grants_self_select ON public.worker_mfa_grants
  FOR SELECT TO authenticated
  USING (
    worker_id IN (
      SELECT workers.id FROM workers
      WHERE workers.user_id = (select auth.uid())
    )
  );

-- worker_sign_in_log
DROP POLICY IF EXISTS worker_signin_log_self_select ON public.worker_sign_in_log;
CREATE POLICY worker_signin_log_self_select ON public.worker_sign_in_log
  FOR SELECT TO authenticated
  USING (
    worker_id IN (
      SELECT workers.id FROM workers
      WHERE workers.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS worker_signin_log_supervisor_flagged ON public.worker_sign_in_log;
CREATE POLICY worker_signin_log_supervisor_flagged ON public.worker_sign_in_log
  FOR SELECT TO authenticated
  USING (
    (flags <> '{}'::text[])
    AND worker_id IN (
      SELECT w.id FROM workers w
      JOIN admins a ON a.company_id = w.company_id
      WHERE a.user_id = (select auth.uid())
    )
  );

-- workers
DROP POLICY IF EXISTS authenticated_select_own_company ON public.workers;
CREATE POLICY authenticated_select_own_company ON public.workers
  FOR SELECT TO authenticated
  USING (company_id = ((((select auth.jwt()) -> 'app_metadata'::text) ->> 'company_id'::text))::uuid);