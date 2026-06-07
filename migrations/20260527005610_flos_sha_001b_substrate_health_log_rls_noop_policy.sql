-- FLOS-SHA-001 follow-up (Cycle 6.5 / gate-5) — clear advisor 0008
-- (rls_enabled_no_policy) on public.substrate_health_log WITHOUT granting
-- any access. The table is operations-internal: only postgres + service_role
-- hold grants; authenticated/anon have none. RLS is enabled with zero
-- policies BY DESIGN (service_role bypasses RLS). Supabase's linter still
-- flags "RLS enabled, no policy" at INFO. Resolve it by:
--   (a) explicitly revoking all from anon + authenticated (durable intent), and
--   (b) adding a no-op RESTRICTIVE deny policy scoped to those roles so a
--       policy row exists. RESTRICTIVE + no PERMISSIVE policy = still fully
--       denied for non-service roles; service_role/postgres are unaffected
--       (RLS bypass, and the policy is not scoped to them).

REVOKE ALL ON public.substrate_health_log FROM anon;
REVOKE ALL ON public.substrate_health_log FROM authenticated;

CREATE POLICY "deny_all_non_service_role"
  ON public.substrate_health_log
  AS RESTRICTIVE
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

COMMENT ON POLICY "deny_all_non_service_role" ON public.substrate_health_log IS
  'FLOS-SHA-001 no-op RESTRICTIVE deny policy. Clears advisor 0008 (rls_enabled_no_policy). Grants no access; service_role/postgres bypass RLS. authenticated/anon also hold zero table privileges.';