-- Resolves CRACK 195: route handler /api/worker/records/export referenced a
-- non-existent table; every export call silently dropped its audit row.
-- Companion code fix: CRACK 245 (capture insert error in route handler).

CREATE TABLE IF NOT EXISTS public.worker_record_exports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id    uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  format       text NOT NULL CHECK (format IN ('csv','json','pdf-receipts','all')),
  date_from    date,
  date_to      date,
  shift_count  integer NOT NULL CHECK (shift_count >= 0),
  ip_address   text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_record_exports_worker_time
  ON public.worker_record_exports (worker_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_worker_record_exports_created_at
  ON public.worker_record_exports (created_at DESC);

ALTER TABLE public.worker_record_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS worker_record_exports_service_all ON public.worker_record_exports;
CREATE POLICY worker_record_exports_service_all
  ON public.worker_record_exports
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

DROP POLICY IF EXISTS worker_record_exports_worker_read_own ON public.worker_record_exports;
CREATE POLICY worker_record_exports_worker_read_own
  ON public.worker_record_exports
  FOR SELECT
  USING (
    (SELECT auth.role()) = 'authenticated'
    AND worker_id IN (
      SELECT id FROM public.workers WHERE user_id = (SELECT auth.uid())
    )
  );