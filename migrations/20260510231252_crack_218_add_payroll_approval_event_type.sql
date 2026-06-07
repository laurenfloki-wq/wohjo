-- CRACK 218 — re-admit PAYROLL_APPROVAL to shift_events event_type CHECK
-- Inverse of CRACK 170 (20260507231730). Re-activates the dormant
-- shift_events_payroll_approval_unique partial index by providing a live
-- event_type for it to guard. Non-Negotiable #2 preserved: no existing
-- row is modified by this migration; the CHECK is replaced with a
-- broader (superset) constraint.

ALTER TABLE public.shift_events
  DROP CONSTRAINT IF EXISTS shift_events_event_type_check;

ALTER TABLE public.shift_events
  ADD CONSTRAINT shift_events_event_type_check
  CHECK (event_type IN (
    'START_EVENT',
    'END_EVENT',
    'SHIFT_COMMIT',
    'SUPERVISOR_APPROVAL',
    'PAYROLL_APPROVAL',
    'INTELLIGENCE_CLEAR',
    'ANOMALY_FLAG',
    'DISPUTE_RAISED',
    'EXPORT_RECORD',
    'CORRECTION',
    'BUG_CORRECTION',
    'SUPERVISOR_RE_APPROVAL',
    'X-FLOSMOSIS-SPEC_VERSION_MIGRATION',
    'WORKER_DISPUTE_FILED'
  ));