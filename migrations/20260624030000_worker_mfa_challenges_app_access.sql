-- Phase A increment 2 — wire the SMS enrollment floor.
--
-- A passkey is enrolled only after a fresh SMS code-verify (hasActiveCodeVerifyGrant
-- now requires an SMS-sourced grant). But worker_mfa_challenges.challenge_for was
-- locked to the three step-up actions, so a normally-signed-in worker could never
-- mint an SMS-sourced grant suitable for enrollment. Add APP_ACCESS: a worker can
-- request + verify an APP_ACCESS code (the existing /api/worker/mfa/issue +
-- /verify path) to mint an SMS-sourced APP_ACCESS grant, which then authorises
-- passkey enrollment. (worker_mfa_grants.challenge_for already allows APP_ACCESS
-- via 20260624020000.)
--
-- Auth-only; does NOT touch shift_events or the WLES chain.

ALTER TABLE public.worker_mfa_challenges DROP CONSTRAINT IF EXISTS worker_mfa_challenges_challenge_for_check;
ALTER TABLE public.worker_mfa_challenges ADD CONSTRAINT worker_mfa_challenges_challenge_for_check
  CHECK (challenge_for IN ('DISPUTE_NEW', 'EXPORT_FULL', 'PHONE_CHANGE', 'APP_ACCESS'));
