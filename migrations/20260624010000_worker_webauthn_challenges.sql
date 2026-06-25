-- Phase A increment 2 (WORKER_PASSKEY_ACCESS) — single-use WebAuthn challenges.
--
-- WebAuthn needs the server-issued random challenge persisted between
-- options-generation and verification. Mirrors worker_mfa_challenges: worker-
-- scoped, short TTL, single-use (consumed_at), service-role only. Auth-only;
-- does NOT touch shift_events or the WLES chain.

CREATE TABLE IF NOT EXISTS public.worker_webauthn_challenges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id    uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  -- base64url challenge as issued in the ceremony options.
  challenge    text NOT NULL,
  -- which ceremony this challenge belongs to.
  ceremony     text NOT NULL CHECK (ceremony IN ('register', 'authenticate')),
  issued_at    timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz
);

-- Latest unconsumed challenge per (worker, ceremony) lookup.
CREATE INDEX IF NOT EXISTS idx_worker_webauthn_challenge_lookup
  ON public.worker_webauthn_challenges (worker_id, ceremony, issued_at DESC)
  WHERE consumed_at IS NULL;

-- RLS: service-role only (the ceremony routes use the service client). RLS
-- enabled with no policy = deny-all for anon/authenticated; service_role
-- bypasses via the grant. (Deliberately no explicit deny-all policy — it
-- renders inconsistently between the drift-gate and attestation fingerprint
-- queries; RLS-enabled-no-policy is the locked-down state. See
-- 20260622160000_sec5_advisor_cleanup.sql.)
ALTER TABLE public.worker_webauthn_challenges ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_webauthn_challenges TO service_role;
