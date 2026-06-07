-- M4-I-a — revoke EXECUTE on export_finalise from anon + authenticated.
-- The route calls this RPC via the service-role client (which is
-- exempt from REVOKE). Public REST API access via /rest/v1/rpc is
-- unintended; revoking closes the surface.

REVOKE EXECUTE ON FUNCTION public.export_finalise(
  uuid, uuid, text, uuid[], text, jsonb, jsonb, jsonb
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.export_finalise(
  uuid, uuid, text, uuid[], text, jsonb, jsonb, jsonb
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.export_finalise(
  uuid, uuid, text, uuid[], text, jsonb, jsonb, jsonb
) FROM authenticated;

-- service_role retains its default EXECUTE; no explicit grant needed.
COMMENT ON FUNCTION public.export_finalise(uuid, uuid, text, uuid[], text, jsonb, jsonb, jsonb) IS
  E'M4-I (2026-06-06): atomic finalise of an export operation. SECURITY DEFINER with explicit admin-membership check inside the body. EXECUTE revoked from anon + authenticated 2026-06-06 — the route layer invokes this only via the service-role client.';