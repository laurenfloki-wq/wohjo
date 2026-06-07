-- Reconciles existing production geofence_events into version control.

CREATE TABLE IF NOT EXISTS public.geofence_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id           uuid NOT NULL REFERENCES public.workers(id) ON DELETE RESTRICT,
  site_id             uuid NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
  detected_at         timestamptz NOT NULL,
  lat                 numeric NOT NULL,
  lng                 numeric NOT NULL,
  accuracy_metres     integer NOT NULL,
  confidence          text NOT NULL,
  synced_from_offline boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_geofence_events_company_id
  ON public.geofence_events (company_id);
CREATE INDEX IF NOT EXISTS idx_geofence_events_site_day
  ON public.geofence_events (site_id, (((detected_at AT TIME ZONE 'UTC'::text))::date));
CREATE INDEX IF NOT EXISTS idx_geofence_events_worker_day
  ON public.geofence_events (worker_id, (((detected_at AT TIME ZONE 'UTC'::text))::date));

ALTER TABLE public.geofence_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_full_access ON public.geofence_events;
CREATE POLICY service_role_full_access ON public.geofence_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS authenticated_select_own_company ON public.geofence_events;
CREATE POLICY authenticated_select_own_company ON public.geofence_events
  FOR SELECT
  TO authenticated
  USING (
    company_id = (((SELECT auth.jwt() -> 'app_metadata') ->> 'company_id'))::uuid
  );