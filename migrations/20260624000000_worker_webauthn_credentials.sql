-- Phase A (WORKER_PASSKEY_ACCESS) — platform-authenticator credentials for
-- worker app access. A passkey replaces the per-session phone-OTP prompt AFTER
-- a worker has verified on a device; it never replaces the SMS/phone-OTP floor
-- (first enrolment, device rotation, recovery all stay on the floor). This
-- table is auth-only: it does NOT touch shift_events or the WLES chain.
--
-- Append-only on the credential material: credential_id and public_key are
-- immutable (a guard trigger blocks UPDATE of either). Rotation is a NEW row
-- plus status='revoked' on the old one — never an in-place key swap. sign_count
-- (WebAuthn signature counter), last_used_at and status remain updatable.

CREATE TABLE IF NOT EXISTS public.worker_webauthn_credentials (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id           uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  -- base64url credential id (the WebAuthn credential.id); globally unique.
  credential_id       text NOT NULL UNIQUE,
  -- base64url-encoded COSE public key returned at registration.
  public_key          text NOT NULL,
  -- WebAuthn signature counter; monotonic, clone-detection (a regression is
  -- rejected at the route layer). Some authenticators always report 0.
  sign_count          bigint NOT NULL DEFAULT 0,
  aaguid              text,
  transports          text[],
  device_label        text,
  -- Bind to the device fingerprint the worker verified on (composite FK; null
  -- until bound). MATCH SIMPLE: if device_fingerprint is null no FK check runs.
  device_fingerprint  text,
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_used_at        timestamptz,
  FOREIGN KEY (worker_id, device_fingerprint)
    REFERENCES public.worker_device_fingerprints (worker_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_worker_webauthn_worker_active
  ON public.worker_webauthn_credentials (worker_id) WHERE status = 'active';

-- ── Append-only guard on the credential material ────────────────────────────
CREATE OR REPLACE FUNCTION public.worker_webauthn_block_key_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $func$
BEGIN
  IF NEW.credential_id IS DISTINCT FROM OLD.credential_id THEN
    RAISE EXCEPTION 'worker_webauthn_credentials.credential_id is immutable (rotate = new row + revoke old)'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.public_key IS DISTINCT FROM OLD.public_key THEN
    RAISE EXCEPTION 'worker_webauthn_credentials.public_key is immutable (rotate = new row + revoke old)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS worker_webauthn_block_key_mutation ON public.worker_webauthn_credentials;
CREATE TRIGGER worker_webauthn_block_key_mutation
  BEFORE UPDATE ON public.worker_webauthn_credentials
  FOR EACH ROW EXECUTE FUNCTION public.worker_webauthn_block_key_mutation();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Workers may SELECT their own credentials (the "your devices" UI). All writes
-- are service-role only (the ceremony routes run as the service client);
-- service_role bypasses RLS via grants.
ALTER TABLE public.worker_webauthn_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS worker_webauthn_self_select ON public.worker_webauthn_credentials;
CREATE POLICY worker_webauthn_self_select
  ON public.worker_webauthn_credentials
  FOR SELECT
  TO authenticated
  USING (worker_id IN (SELECT id FROM public.workers WHERE user_id = auth.uid()));

GRANT SELECT ON public.worker_webauthn_credentials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_webauthn_credentials TO service_role;
