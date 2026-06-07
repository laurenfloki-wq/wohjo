-- Reconciles existing production dispatcher_audit_log into version control.

CREATE TABLE IF NOT EXISTS public.dispatcher_audit_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id     uuid NOT NULL REFERENCES public.supervisors(id) ON DELETE RESTRICT,
  run_at            timestamptz NOT NULL DEFAULT now(),
  codes_sent        text[] NOT NULL,
  sms_sid           text,
  db_write_success  boolean NOT NULL,
  error_message     text,
  reconciled        boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS dispatcher_audit_log_supervisor_run
  ON public.dispatcher_audit_log (supervisor_id, run_at DESC);

ALTER TABLE public.dispatcher_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_full_access ON public.dispatcher_audit_log;
CREATE POLICY service_role_full_access ON public.dispatcher_audit_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);