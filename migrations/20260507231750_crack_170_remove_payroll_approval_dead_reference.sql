-- CRACK 170: Remove PAYROLL_APPROVAL from event_data_shape's required-shift_id list
-- 
-- Architectural rationale: PAYROLL_APPROVAL was modelled on the Stripe webhook
-- pattern (external system writes back to FLOSTRUCTION as source of truth).
-- Architecture has since clarified: FLOSTRUCTION is the records substrate;
-- payroll systems integrate WITH it via API pulls, not the reverse. The reference
-- in event_data_shape is dead — no row of type PAYROLL_APPROVAL can exist
-- (event_type_check doesn't include it), so the shape constraint never fires for
-- this type.
-- 
-- UNDENIABLE Council unanimous (JOBS-IVE / OGILVY / GRAHAM-MUNGER / 
-- MCKINSEY-DRUCKER / VOGELS-TALEB) on removal vs implementation:
-- substrate position is correct, do not implement Stripe-direction webhooks.
-- When real payroll-API integration ships post-Mo, a properly-named event
-- (e.g., PAYROLL_BATCH_PULLED) will be designed for the substrate-correct
-- direction (payroll PULLS from FLOSTRUCTION, FLOSTRUCTION logs the pull).

ALTER TABLE public.shift_events
  DROP CONSTRAINT shift_events_event_data_shape;

ALTER TABLE public.shift_events
  ADD CONSTRAINT shift_events_event_data_shape
  CHECK (
    event_type <> ALL (ARRAY['SUPERVISOR_APPROVAL', 'DISPUTE_RAISED', 'SHIFT_COMMIT'])
    OR (event_data ? 'shift_id')
  );