-- Pre-flight: confirm OLD column state matches expectation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='supervisors'
      AND column_name='last_batch_sms_date' AND data_type='date'
  ) THEN
    RAISE EXCEPTION 'Pre-flight failed: last_batch_sms_date missing or wrong type';
  END IF;
END $$;

-- Migration 2.0 — column rename + retype (closes CRACK 11, 67, 98)
ALTER TABLE public.supervisors
  RENAME COLUMN last_batch_sms_date TO last_batch_sms_sent_at;

ALTER TABLE public.supervisors
  ALTER COLUMN last_batch_sms_sent_at TYPE TIMESTAMPTZ
  USING (last_batch_sms_sent_at::text || ' 00:00:00+00')::timestamptz;

-- Post-flight: confirm NEW column state
DO $$
DECLARE v_type TEXT;
BEGIN
  SELECT data_type INTO v_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='supervisors'
    AND column_name='last_batch_sms_sent_at';
  IF v_type != 'timestamp with time zone' THEN
    RAISE EXCEPTION 'Post-flight failed: type is %, expected timestamptz', v_type;
  END IF;
END $$;

-- approve_supervisor_batch RPC (companion for Patch 3.5 — created but unused per partial closure)
CREATE OR REPLACE FUNCTION public.approve_supervisor_batch(
  p_supervisor_id UUID, p_shift_ids UUID[], p_actor_phone TEXT, p_now TIMESTAMPTZ
) RETURNS TABLE (approved_shift_id UUID) AS $func$
BEGIN
  PERFORM 1 FROM public.supervisors WHERE id = p_supervisor_id FOR UPDATE;
  RETURN QUERY
  UPDATE public.shifts
  SET status = 'SUPERVISOR_APPROVED',
      supervisor_approved_by = p_supervisor_id,
      supervisor_approved_at = p_now,
      updated_at = p_now
  WHERE id = ANY(p_shift_ids) AND status = 'SUBMITTED'
  RETURNING id;
END;
$func$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public;

REVOKE EXECUTE ON FUNCTION public.approve_supervisor_batch(UUID, UUID[], TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_supervisor_batch(UUID, UUID[], TEXT, TIMESTAMPTZ) TO service_role;

-- dispatcher_audit_log table (companion for Patch 5.1 + 5.3)
CREATE TABLE IF NOT EXISTS public.dispatcher_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id UUID NOT NULL REFERENCES supervisors(id) ON DELETE RESTRICT,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  codes_sent TEXT[] NOT NULL,
  sms_sid TEXT,
  db_write_success BOOLEAN NOT NULL,
  error_message TEXT,
  reconciled BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS dispatcher_audit_log_supervisor_run
  ON public.dispatcher_audit_log(supervisor_id, run_at DESC);

ALTER TABLE public.dispatcher_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_full_access ON public.dispatcher_audit_log
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);