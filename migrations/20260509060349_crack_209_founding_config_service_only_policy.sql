-- CRACK 209: Add explicit service_role-only policy on founding_config
-- founding_config has RLS enabled but zero policies after CRACK 196 dropped
-- the dormant anon_select_founding_config policy. Intent (per CRACK 187 
-- verification) is service_role-only access; only callsite is a service_role RPC.
-- This policy documents and enforces that intent. service_role bypasses RLS
-- by design, so this is documentary discipline closing advisor 0008 finding.
-- RLS pattern: (select auth.role()) per CRACK 206 substrate-DD discipline.

CREATE POLICY founding_config_service_only
  ON public.founding_config
  FOR ALL
  USING ((select auth.role()) = 'service_role'::text)
  WITH CHECK ((select auth.role()) = 'service_role'::text);