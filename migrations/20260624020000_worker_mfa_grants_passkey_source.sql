-- Phase A increment 2 — let a worker_mfa_grants grant come from a passkey
-- assertion as well as an SMS code-verify.
--
-- A grant today is minted only by verifyChallenge (SMS path): challenge_id is
-- NOT NULL and FKs worker_mfa_challenges. The passkey auth ceremony issues the
-- SAME grant (same TTL, same device_binding) but its originating challenge lives
-- in worker_webauthn_challenges. So: add webauthn_challenge_id, relax
-- challenge_id to nullable, and require EXACTLY ONE source. APP_ACCESS is added
-- to challenge_for as the passkey app-access grant class.
--
-- Auth-only; does NOT touch shift_events or the WLES chain.

ALTER TABLE public.worker_mfa_grants
  ADD COLUMN IF NOT EXISTS webauthn_challenge_id uuid
    REFERENCES public.worker_webauthn_challenges(id);

ALTER TABLE public.worker_mfa_grants ALTER COLUMN challenge_id DROP NOT NULL;

-- Exactly one origin: an SMS challenge XOR a passkey challenge.
ALTER TABLE public.worker_mfa_grants DROP CONSTRAINT IF EXISTS worker_mfa_grants_one_source;
ALTER TABLE public.worker_mfa_grants ADD CONSTRAINT worker_mfa_grants_one_source
  CHECK ((challenge_id IS NOT NULL) <> (webauthn_challenge_id IS NOT NULL));

-- Add APP_ACCESS (the passkey app-access grant class) to challenge_for.
ALTER TABLE public.worker_mfa_grants DROP CONSTRAINT IF EXISTS worker_mfa_grants_challenge_for_check;
ALTER TABLE public.worker_mfa_grants ADD CONSTRAINT worker_mfa_grants_challenge_for_check
  CHECK (challenge_for IN ('DISPUTE_NEW', 'EXPORT_FULL', 'PHONE_CHANGE', 'APP_ACCESS'));
