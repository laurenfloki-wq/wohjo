-- O-RLS-2-a: admins table policy consolidation
--
-- Existing state:
--   admins_service_write: FOR ALL TO public, qual auth.role()='service_role'
--   admins_self_select:   FOR SELECT TO public, qual user_id=auth.uid()
-- Both policies match SELECT operations for all roles (anon, authenticated,
-- authenticator, dashboard_user, supabase_privileged_role), so the linter
-- correctly flags 5 multiple_permissive_policies WARNs.
--
-- Fix: split service_write (FOR ALL) into separate INSERT/UPDATE/DELETE
-- policies, and merge SELECT into one consolidated policy.
--
-- Substrate-DD: admins has 1 row. The consolidated SELECT preserves both
-- paths via OR — service_role can still read all admins, the single existing
-- admin can still read their own row. Service-role writes are preserved
-- via three new explicit policies. Use ( SELECT auth.<fn>() ) initplan
-- pattern throughout.

DROP POLICY IF EXISTS "admins_service_write" ON public.admins;
DROP POLICY IF EXISTS "admins_self_select"  ON public.admins;

CREATE POLICY "admins_select" ON public.admins
  FOR SELECT
  USING (
    ( SELECT auth.role() ) = 'service_role'
    OR user_id = ( SELECT auth.uid() )
  );

CREATE POLICY "admins_service_insert" ON public.admins
  FOR INSERT
  WITH CHECK (( SELECT auth.role() ) = 'service_role');

CREATE POLICY "admins_service_update" ON public.admins
  FOR UPDATE
  USING      (( SELECT auth.role() ) = 'service_role')
  WITH CHECK (( SELECT auth.role() ) = 'service_role');

CREATE POLICY "admins_service_delete" ON public.admins
  FOR DELETE
  USING (( SELECT auth.role() ) = 'service_role');