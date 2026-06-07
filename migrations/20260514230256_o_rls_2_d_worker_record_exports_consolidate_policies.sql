-- O-RLS-2-d: worker_record_exports table policy consolidation
--
-- Existing state:
--   worker_record_exports_service_all:     FOR ALL TO public,
--     qual auth.role()='service_role'
--   worker_record_exports_worker_read_own: FOR SELECT TO public,
--     qual auth.role()='authenticated' AND worker_id IN (worker's own row)
-- Both policies match SELECT for all roles → 5 multiple_permissive_policies WARNs.
--
-- Fix: same pattern as worker_disputes — split FOR ALL, consolidate SELECT.
--
-- Substrate-DD: worker_record_exports has 0 rows live (4 EXPORT_RECORD events
-- exist in shift_events from earlier testing, but no exports persisted in
-- this table — exports may be tracked only as shift_events).
-- The EXPORT_RECORD path writes through service_role from the export RPC
-- (crack_219_create_export_rpc).

DROP POLICY IF EXISTS "worker_record_exports_service_all"     ON public.worker_record_exports;
DROP POLICY IF EXISTS "worker_record_exports_worker_read_own" ON public.worker_record_exports;

CREATE POLICY "worker_record_exports_select" ON public.worker_record_exports
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

CREATE POLICY "worker_record_exports_service_insert" ON public.worker_record_exports
  FOR INSERT
  WITH CHECK (( SELECT auth.role() ) = 'service_role');

CREATE POLICY "worker_record_exports_service_update" ON public.worker_record_exports
  FOR UPDATE
  USING      (( SELECT auth.role() ) = 'service_role')
  WITH CHECK (( SELECT auth.role() ) = 'service_role');

CREATE POLICY "worker_record_exports_service_delete" ON public.worker_record_exports
  FOR DELETE
  USING (( SELECT auth.role() ) = 'service_role');