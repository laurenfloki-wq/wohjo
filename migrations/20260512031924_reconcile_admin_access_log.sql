-- Reconciles existing production admin_access_log into version control.
-- Idempotent: safe against environments where table already exists.

CREATE TABLE IF NOT EXISTS public.admin_access_log (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id        uuid NOT NULL,
  customer_id_accessed uuid,
  resource_type        text NOT NULL,
  resource_id          uuid,
  action               text NOT NULL,
  "timestamp"          timestamptz NOT NULL DEFAULT now(),
  source_ip            text,
  reason_code          text
);

CREATE INDEX IF NOT EXISTS idx_admin_access_log_admin_time
  ON public.admin_access_log (admin_user_id, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_admin_access_log_customer
  ON public.admin_access_log (customer_id_accessed, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_admin_access_log_resource
  ON public.admin_access_log (resource_type, resource_id);

ALTER TABLE public.admin_access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_access_log_service_insert ON public.admin_access_log;
CREATE POLICY admin_access_log_service_insert ON public.admin_access_log
  FOR INSERT WITH CHECK ((SELECT auth.role()) = 'service_role');

DROP POLICY IF EXISTS admin_access_log_service_select ON public.admin_access_log;
CREATE POLICY admin_access_log_service_select ON public.admin_access_log
  FOR SELECT USING ((SELECT auth.role()) = 'service_role');