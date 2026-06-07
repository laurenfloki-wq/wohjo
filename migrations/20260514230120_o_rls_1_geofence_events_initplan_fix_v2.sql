-- O-RLS-1 v2: geofence_events init-plan fix using canonical Supabase pattern
--
-- The linter's auth_rls_initplan rule specifically looks for the pattern
-- (SELECT auth.<function>()) directly wrapping the auth function call.
-- Wrapping the full expression (which is logically equivalent) is not
-- recognised. This migration uses the canonical pattern.
--
-- Substrate-DD: geofence_events still has 0 rows. service_role_full_access
-- policy unaffected.

DROP POLICY IF EXISTS "authenticated_select_own_company" ON public.geofence_events;

CREATE POLICY "authenticated_select_own_company"
  ON public.geofence_events
  FOR SELECT
  TO authenticated
  USING (
    company_id = ((( SELECT auth.jwt() ) -> 'app_metadata' ->> 'company_id'))::uuid
  );