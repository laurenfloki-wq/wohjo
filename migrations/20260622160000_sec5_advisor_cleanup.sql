-- SEC-5 + security-advisor cleanup (the WARN-level fix).
--
-- advance_wles_v1_watermark (added in A1) is a SECURITY DEFINER function that
-- only ever runs as the shift_events AFTER INSERT trigger — it must NOT be
-- directly callable via PostgREST RPC by the API roles (advisor 0028/0029, both
-- WARN; a self-introduced regression). Triggers invoke it regardless of EXECUTE
-- grant, so revoking is safe.
REVOKE EXECUTE ON FUNCTION public.advance_wles_v1_watermark() FROM PUBLIC, anon, authenticated;

-- NOTE: explicit deny-all RLS policies for notification_dead_letter +
-- wles_v1_watermark (advisor 0008, INFO) were intentionally NOT added. RLS is
-- already enabled with no policy = deny-all for anon/authenticated, and
-- service_role bypasses RLS via grants — so those tables are already locked
-- down. An explicit policy renders differently between the drift-gate and
-- attestation fingerprint queries (breaking the reference pin) for no security
-- gain, so we leave the linter's two INFO notes rather than churn the policies
-- dimension. Grants are not a tracked drift dimension, so this REVOKE is
-- drift-safe.
