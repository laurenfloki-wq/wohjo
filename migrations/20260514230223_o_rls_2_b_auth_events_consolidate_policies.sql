-- O-RLS-2-b: auth_events table policy consolidation
--
-- Existing state:
--   auth_events_company_admin_select: FOR SELECT TO authenticated,
--     qual company_id IN (SELECT admins.company_id FROM admins WHERE user_id=auth.uid())
--   auth_events_self_select: FOR SELECT TO authenticated,
--     qual actor_user_id = auth.uid()
-- Two SELECT policies on the same role → 1 multiple_permissive_policies WARN.
--
-- Fix: consolidate into one SELECT policy with OR. No service-role policy
-- present because service-role bypasses RLS via service key on the standard
-- ingestion path.
--
-- Substrate-DD: auth_events has 0 rows (R-FOR-1 still in flight). After
-- R-FOR-1 closes, every worker sign-in writes an auth_event. The consolidated
-- policy preserves both read paths: workers see their own events,
-- company admins see all events in their company.

DROP POLICY IF EXISTS "auth_events_company_admin_select" ON public.auth_events;
DROP POLICY IF EXISTS "auth_events_self_select"          ON public.auth_events;

CREATE POLICY "auth_events_select" ON public.auth_events
  FOR SELECT
  TO authenticated
  USING (
    actor_user_id = ( SELECT auth.uid() )
    OR company_id IN (
      SELECT company_id FROM public.admins
      WHERE user_id = ( SELECT auth.uid() )
    )
  );