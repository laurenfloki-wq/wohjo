-- W6(b)/SG-7 -- Admin TOTP MFA (second factor for the WOHJO Command surface)
-- 2026-06-11 . Ship Gate programme W6(b)
--
-- Admins authenticate with a Supabase session; this adds an optional
-- (graduated-enforcement) TOTP second factor:
--   * admin_mfa_totp   -- one row per admin auth user; RFC 6238 secret,
--     unconfirmed until the admin proves possession with a first code.
--   * admin_mfa_grants -- short-lived "MFA satisfied" capability minted
--     after a successful TOTP verification; asserted by the command
--     session chokepoint (getCompanyIdForSession).
--
-- Enforcement is graduated at app layer: admins with NO confirmed
-- secret pass with a warn-log (no founder lockout); admins WITH a
-- confirmed secret must hold an unexpired grant. Hard-require for all
-- admins is a founder decision recorded separately.
--
-- user_id is the auth.users id (no FK -- auth schema is platform-managed
-- and outside the rebuild contract; admins PK is composite
-- (user_id, company_id) so no single-column public FK target exists).

BEGIN;

CREATE TABLE IF NOT EXISTS admin_mfa_totp (
  user_id        uuid PRIMARY KEY,
  -- RFC 6238 shared secret, base32. Must be recoverable for code
  -- verification, so stored as-is under service-role-only RLS
  -- (encrypted at rest by the platform). Never returned to clients
  -- after enrolment completes.
  secret_base32  text NOT NULL CHECK (length(secret_base32) >= 16),
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- Set when the admin proves possession with a first valid code.
  -- Enforcement only applies to confirmed secrets.
  confirmed_at   timestamptz,
  -- Replay guard: highest accepted 30-second TOTP step. A code for a
  -- step <= this value is rejected even if cryptographically valid.
  last_used_step bigint NOT NULL DEFAULT 0 CHECK (last_used_step >= 0)
);

CREATE TABLE IF NOT EXISTS admin_mfa_grants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES admin_mfa_totp(user_id) ON DELETE CASCADE,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  -- Forensic context at verification time; never used for binding.
  ip_address  inet,
  user_agent  text,
  CONSTRAINT admin_mfa_grant_expires_after_grant
    CHECK (expires_at > granted_at)
);

-- Lookup: "does this admin hold an unexpired grant?"
CREATE INDEX IF NOT EXISTS idx_admin_mfa_grant_active
  ON admin_mfa_grants (user_id, expires_at DESC);

-- -- RLS ----------------------------------------------------------------
-- Service-role only, with EXPLICIT policies per the S1.5 standard
-- (rate_limit_buckets_service_only precedent) -- never "no policy =
-- intentional". TOTP secrets must never be readable through PostgREST
-- by anon/authenticated.
ALTER TABLE admin_mfa_totp ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_mfa_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_mfa_totp_service_only ON public.admin_mfa_totp;
CREATE POLICY admin_mfa_totp_service_only ON public.admin_mfa_totp
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS admin_mfa_grants_service_only ON public.admin_mfa_grants;
CREATE POLICY admin_mfa_grants_service_only ON public.admin_mfa_grants
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;

-- Rollback:
--   DROP TABLE IF EXISTS admin_mfa_grants;
--   DROP TABLE IF EXISTS admin_mfa_totp;
