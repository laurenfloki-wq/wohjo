-- Reconciles existing production worker_disputes into version control.

CREATE TABLE IF NOT EXISTS public.worker_disputes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id         uuid NOT NULL REFERENCES public.workers(id) ON DELETE RESTRICT,
  company_id        uuid NOT NULL,
  dispute_type      text NOT NULL,
  narrative         text NOT NULL,
  related_shift_id  uuid,
  status            text NOT NULL DEFAULT 'open',
  resolution_notes  text,
  resolved_at       timestamptz,
  resolved_by       uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_disputes_worker_id
  ON public.worker_disputes (worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_disputes_company_id
  ON public.worker_disputes (company_id);
CREATE INDEX IF NOT EXISTS idx_worker_disputes_status
  ON public.worker_disputes (status)
  WHERE status <> ALL (ARRAY['resolved'::text, 'closed_no_action'::text]);

ALTER TABLE public.worker_disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS worker_disputes_service_all ON public.worker_disputes;
CREATE POLICY worker_disputes_service_all ON public.worker_disputes
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

DROP POLICY IF EXISTS worker_disputes_worker_read_own ON public.worker_disputes;
CREATE POLICY worker_disputes_worker_read_own ON public.worker_disputes
  FOR SELECT
  USING (
    (SELECT auth.role()) = 'authenticated'
    AND worker_id IN (
      SELECT id FROM public.workers WHERE user_id = (SELECT auth.uid())
    )
  );