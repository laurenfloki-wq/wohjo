-- O-RLS-2-e: worker_sign_in_log table policy consolidation
--
-- Existing state:
--   worker_signin_log_self_select:        FOR SELECT TO authenticated,
--     qual worker_id IN (worker's own row)
--   worker_signin_log_supervisor_flagged: FOR SELECT TO authenticated,
--     qual flags <> '{}' AND admin of worker's company
-- Two SELECT policies on `authenticated` → 1 multiple_permissive_policies WARN.
--
-- Fix: consolidate into one SELECT policy. Workers see all their own sign-in
-- log entries; admins see only flagged entries for workers in their company
-- (anomaly review path).
--
-- Substrate-DD: worker_sign_in_log has 1 row from earlier Joao testing.
-- The consolidated policy preserves both paths via OR. Bootstrap-worker
-- ingestion path writes through service_role (no policy needed; bypass).

DROP POLICY IF EXISTS "worker_signin_log_self_select"        ON public.worker_sign_in_log;
DROP POLICY IF EXISTS "worker_signin_log_supervisor_flagged" ON public.worker_sign_in_log;

CREATE POLICY "worker_signin_log_select" ON public.worker_sign_in_log
  FOR SELECT
  TO authenticated
  USING (
    worker_id IN (
      SELECT id FROM public.workers
      WHERE user_id = ( SELECT auth.uid() )
    )
    OR (
      flags <> '{}'::text[]
      AND worker_id IN (
        SELECT w.id FROM public.workers w
        JOIN public.admins a ON a.company_id = w.company_id
        WHERE a.user_id = ( SELECT auth.uid() )
      )
    )
  );