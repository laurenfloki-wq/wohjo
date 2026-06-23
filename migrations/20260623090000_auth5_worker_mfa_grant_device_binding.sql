-- AUTH-5 (launch-readiness audit) — device-bind worker MFA grants.
--
-- A grant is a 15-minute, multi-use capability keyed only by (worker_id,
-- challenge_for). Nothing bound it to the device that earned it, so a hijacked
-- worker session could ride a grant that the real worker minted on a different
-- device. We keep the deliberate multi-use semantics (no "MFA after every
-- form error") but pin each new grant to a device fingerprint (a hash of the
-- verifying request's user-agent), checked again when the gated action runs.
--
-- Nullable + no backfill: grants minted before this column existed stay NULL
-- and are grandfathered (treated as unbound) until they expire — at most 15
-- minutes after deploy. Every grant minted after deploy carries a binding.

ALTER TABLE worker_mfa_grants
  ADD COLUMN IF NOT EXISTS device_binding text;

COMMENT ON COLUMN worker_mfa_grants.device_binding IS
  'AUTH-5: sha256 hex of the verifying request user-agent. NULL = legacy/unbound (grandfathered). Set at mint, re-checked at assertActiveGrant.';
