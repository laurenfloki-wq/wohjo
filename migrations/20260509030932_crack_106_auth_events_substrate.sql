BEGIN;

CREATE TABLE IF NOT EXISTS public.auth_events (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at        timestamptz NOT NULL DEFAULT now(),
  event_type         text        NOT NULL,
  actor_user_id      uuid,
  actor_email        text,
  actor_phone        text,
  company_id         uuid        REFERENCES public.companies(id) ON DELETE SET NULL,
  ip_address         inet,
  ip_country         text,
  user_agent         text,
  payload            jsonb       NOT NULL DEFAULT '{}',
  supabase_event_id  text        UNIQUE,
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

DROP POLICY IF EXISTS auth_events_self_select ON public.auth_events;
CREATE POLICY auth_events_self_select ON public.auth_events
  FOR SELECT TO authenticated
  USING (actor_user_id = auth.uid());

DROP POLICY IF EXISTS auth_events_company_admin_select ON public.auth_events;
CREATE POLICY auth_events_company_admin_select ON public.auth_events
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.admins WHERE user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT ON public.auth_events TO service_role;

COMMIT;