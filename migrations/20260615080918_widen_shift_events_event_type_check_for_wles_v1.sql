-- Joao live-E2E unblock. WLES_V1_ENABLED is ON in prod, but the
-- shift_events_event_type_check constraint predated the v1 canonical
-- event vocabulary, so every v1 worker capture (CLOCK_IN on start,
-- CLOCK_OUT on end, BREAK_START/BREAK_END, APPROVAL) was rejected 400.
-- Source of truth for the v1 names: src/lib/wles/v1-types.ts WLES_EVENT_TYPES
-- and v1-translate.ts §7.1-7.5. Strict widen: new set is a superset of the
-- old, so no existing row can be invalidated and the hash chain is untouched.
-- The validate_shift_event_chain trigger already returns NEW for spec_version='1.0'
-- rows, so this CHECK is the only gate. Idempotent via DROP IF EXISTS.
ALTER TABLE public.shift_events DROP CONSTRAINT IF EXISTS shift_events_event_type_check;
ALTER TABLE public.shift_events ADD CONSTRAINT shift_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    -- existing v0 + shared vocabulary (unchanged)
    'START_EVENT','END_EVENT','SHIFT_COMMIT','SUPERVISOR_APPROVAL','PAYROLL_APPROVAL',
    'INTELLIGENCE_CLEAR','ANOMALY_FLAG','DISPUTE_RAISED','EXPORT_RECORD','CORRECTION',
    'BUG_CORRECTION','SUPERVISOR_RE_APPROVAL','WORKER_DISPUTE_FILED','WORKER_CREATED',
    'X-FLOSMOSIS-SPEC_VERSION_MIGRATION','X-FLOSMOSIS-SPEC_VERSION_ANOMALY',
    -- WLES v1.0 canonical capture vocabulary (added)
    'CLOCK_IN','CLOCK_OUT','BREAK_START','BREAK_END','APPROVAL'
  ]::text[]));
