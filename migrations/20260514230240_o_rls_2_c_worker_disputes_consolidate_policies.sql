-- O-RLS-2-c: worker_disputes table policy consolidation
--
-- Existing state:
--   worker_disputes_service_all:        FOR ALL TO public, qual auth.role()='service_role'
--   worker_disputes_worker_read_own:    FOR SELECT TO public, qual auth.role()='authenticated'
--                                       AND worker_id IN (worker's own row)
-- Both policies match SELECT for all roles → 5 multiple_permissive_policies WARNs.
--
-- Fix: split service_all into INSERT/UPDATE/DELETE, consolidate SELECT.
--
-- Substrate-DD: worker_disputes has 0 rows. Worker dispute path (R-DISPUTE
-- not on critical path for Mo) writes through service_role from API route.
-- Read path needs to preserve worker self-read.

DROP POLICY IF EXISTS "worker_disputes_service_all"     ON public.worker_disputes;
DROP POLICY IF EXISTS "worker_disputes_worker_read_own" ON public.worker_disputes;

CREATE POLICY "worker_disputes_select" ON public.worker_disputes
  FOR SELECT
  USING (
    ( SELECT auth.role() ) = 'service_role'
    OR (
      ( SELECT auth.role() ) = 'authenticated'
      AND worker_id IN (
        SELECT id FROM public.workers
        WHERE user_id = ( SELECT auth.uid() )
      )
    )
  );

CREATE POLICY "worker_disputes_service_insert" ON public.worker_disputes
  FOR INSERT
  WITH CHECK (( SELECT auth.role() ) = 'service_role');

CREATE POLICY "worker_disputes_service_update" ON public.worker_disputes
  FOR UPDATE
  USING      (( SELECT auth.role() ) = 'service_role')
  WITH CHECK (( SELECT auth.role() ) = 'service_role');

CREATE POLICY "worker_disputes_service_delete" ON public.worker_disputes
  FOR DELETE
  USING (( SELECT auth.role() ) = 'service_role');