-- SEC-5 + security-advisor cleanup.
--
-- 1. advance_wles_v1_watermark (added in A1) is a SECURITY DEFINER function that
--    only ever runs as the shift_events AFTER INSERT trigger — it must NOT be
--    directly callable via PostgREST RPC by the API roles (advisor 0028/0029).
--    Triggers invoke it regardless of EXECUTE grant, so revoking is safe.
REVOKE EXECUTE ON FUNCTION public.advance_wles_v1_watermark() FROM PUBLIC, anon, authenticated;

-- 2. Explicit deny-all RLS policies for the two RLS-enabled-no-policy tables
--    (advisor 0008). service_role bypasses RLS (its grant-based access is
--    unchanged); anon/authenticated had no grants anyway — this makes the
--    deny-all intent explicit and silences the linter.
CREATE POLICY "no_client_access" ON public.notification_dead_letter
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "no_client_access" ON public.wles_v1_watermark
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
