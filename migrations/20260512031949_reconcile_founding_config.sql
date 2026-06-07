-- Reconciles existing production founding_config into version control.

CREATE TABLE IF NOT EXISTS public.founding_config (
  key   text PRIMARY KEY,
  value text
);

ALTER TABLE public.founding_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS founding_config_service_only ON public.founding_config;
CREATE POLICY founding_config_service_only ON public.founding_config
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');