-- =============================================================================
-- MIGRATION R-FOR-1 — auth_events.event_type CHECK constraint
-- 2026-05-15 · Gate R (forensic side-pipe evidence)
--
-- Adds a CHECK constraint enumerating:
--   (a) FLOSMOSIS internal vocabulary (X-FLOSMOSIS-* prefix) per
--       Gate R-FOR-1 pack §2.
--   (b) Supabase native auth taxonomy that the Standard Webhooks
--       hook at /api/auth/events/hook may deliver if configured.
--
-- Pattern: two-list ALLOW set, no SOURCE column needed — the
-- X-FLOSMOSIS-* prefix self-identifies the route-level origin.
--
-- Safe to apply with existing rows: 0 rows in production at apply
-- time (R-FOR-1 forensic gap diagnosis 2026-05-13; re-verified
-- 2026-05-15 09:30 AEST).
--
-- Substrate-DD trail:
--   chat-Claude received SQL via Lauren ferry, reviewed against pack §1.1
--   (no current CHECK on event_type — verified in pre-flight),
--   pack §2 vocabulary alignment, idempotent BEGIN/COMMIT pattern.
--   Applied via Supabase MCP to project rwnxnnudljpgyfwbnosu.
-- =============================================================================

ALTER TABLE public.auth_events
  DROP CONSTRAINT IF EXISTS auth_events_event_type_check;

ALTER TABLE public.auth_events
  ADD CONSTRAINT auth_events_event_type_check CHECK (
    event_type IN (
      -- FLOSMOSIS internal vocabulary (route-level emissions)
      'X-FLOSMOSIS-WORKER_BOOTSTRAP_LINKED',
      'X-FLOSMOSIS-WORKER_BOOTSTRAP_ALREADY_LINKED',
      'X-FLOSMOSIS-WORKER_BOOTSTRAP_NO_MATCH',
      'X-FLOSMOSIS-WORKER_BOOTSTRAP_CONFLICT',
      'X-FLOSMOSIS-WORKER_SHIFT_START_AUTHN',
      'X-FLOSMOSIS-WORKER_SHIFT_END_AUTHN',
      'X-FLOSMOSIS-ADMIN_SESSION_AUTHN',
      'X-FLOSMOSIS-SUPERVISOR_LOGIN_AUTHN',
      'X-FLOSMOSIS-MFA_CHALLENGE_ISSUED',
      'X-FLOSMOSIS-MFA_CHALLENGE_VERIFIED',
      'X-FLOSMOSIS-MFA_CHALLENGE_FAILED',
      'X-FLOSMOSIS-AUTH_SURFACE_UNKNOWN',
      -- Supabase native auth taxonomy (Standard Webhooks delivery)
      'sign_in',
      'sign_up',
      'sign_out',
      'token_refresh',
      'password_reset',
      'email_change',
      'phone_change',
      'mfa_enrol',
      'mfa_unenrol',
      'account_deletion',
      'otp_sent',
      'otp_verified',
      'link_sent'
    )
  );