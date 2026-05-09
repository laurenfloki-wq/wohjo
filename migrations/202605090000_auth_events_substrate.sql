-- =============================================================================
-- MIGRATION CRACK 106 — substrate-controlled auth event audit table
-- 2026-05-09 · Overnight wave
--
-- Creates public.auth_events: FLOSMOSIS-owned audit trail for every
-- Supabase Auth event (sign_in, sign_up, sign_out, token_refresh,
-- password_reset, email_change, phone_change, mfa_enrol, etc.).
--
-- Populated via the Auth Hook at /api/auth/events/hook.
-- Deduplicated on supabase_event_id (at-least-once delivery from Supabase).
--
-- RLS:
--   - Workers: SELECT own events (actor_user_id = auth.uid())
--   - Admins:  SELECT events for their company
--   - No INSERT/UPDATE/DELETE for non-service-role
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.auth_events (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at        timestamptz NOT NULL DEFAULT now(),
  -- Event taxonomy: sign_in, sign_up, sign_out, token_refresh,
  -- password_reset, email_change, phone_change, mfa_enrol, mfa_unenrol,
  -- account_deletion, otp_sent, otp_verified, link_sent.
  event_type         text        NOT NULL,
  -- Auth principal.
  actor_user_id      uuid,
  actor_email        text,
  actor_phone        text,
  -- FLOSMOSIS context — derived from admins or workers join at hook time.
  company_id         uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  -- Network context (from Vercel edge headers on the hook request).
  ip_address         inet,
  ip_country         text,
  user_agent         text,
  -- Full event payload from Supabase (scrubbed of secrets at hook layer).
  payload            jsonb       NOT NULL DEFAULT '{}',
  -- Dedup key: Supabase delivers at-least-once; ON CONFLICT DO NOTHING.
  supabase_event_id  text        UNIQUE,
  -- Forward-compatible hash chain (not populated in Phase 1; reserved).
  event_hash         text,
  previous_event_hash text
);

CREATE INDEX IF NOT EXISTS idx_auth_events_actor_time
  ON public.auth_events (actor_user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_events_company_time
  ON public.auth_events (company_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_events_type_time
  ON public.auth_events (event_type, occurred_at DESC);

ALTER TABLE public.auth_events ENABLE ROW LEVEL SECURITY;

-- Workers see their own auth history.
DROP POLICY IF EXISTS auth_events_self_select ON public.auth_events;
CREATE POLICY auth_events_self_select ON public.auth_events
  FOR SELECT TO authenticated
  USING (actor_user_id = auth.uid());

-- Admins see events for their company.
DROP POLICY IF EXISTS auth_events_company_admin_select ON public.auth_events;
CREATE POLICY auth_events_company_admin_select ON public.auth_events
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.admins WHERE user_id = auth.uid()
    )
  );

-- service_role: full access (bypasses RLS).
GRANT SELECT, INSERT ON public.auth_events TO service_role;

COMMIT;

-- Post-apply verification:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public' AND table_name='auth_events';
--
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname='auth_events';
--
--   SELECT polname FROM pg_policy
--   WHERE polrelid='public.auth_events'::regclass;
