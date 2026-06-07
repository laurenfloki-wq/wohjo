-- O-RLS-1: geofence_events init-plan fix
-- 
-- The existing policy wraps auth.jwt() inside a SELECT subquery, but the JSON
-- path operator (->>) and uuid cast are applied outside the subquery. The
-- advisor's auth_rls_initplan linter does not recognise this pattern as an
-- initplan and continues to flag the policy.
--
-- Fix: pull the full company_id resolution (JSON traversal + cast) inside the
-- SELECT subquery so the result is a single uuid value evaluated once per
-- query, not once per row.
--
-- Substrate-DD: geofence_events has 0 rows. Service-role-full-access policy
-- is unaffected. No behavioural change for authenticated users; only the
-- planner shape changes.

DROP POLICY IF EXISTS "authenticated_select_own_company" ON public.geofence_events;

CREATE POLICY "authenticated_select_own_company"
  ON public.geofence_events
  FOR SELECT
  TO authenticated
  USING (
    company_id = ( SELECT ((auth.jwt() -> 'app_metadata') ->> 'company_id')::uuid )
  );