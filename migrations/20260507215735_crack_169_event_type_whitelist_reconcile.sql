-- CRACK 169: Reconcile event_type whitelist
-- Drop the narrow Phase 4 whitelist; broader shift_events_event_type_check
-- already covers valid-set enforcement and includes INTELLIGENCE_CLEAR,
-- ANOMALY_FLAG, EXPORT_RECORD.
--
-- Strategy: single source of truth (broader CHECK kept, narrow dropped).

ALTER TABLE public.shift_events
  DROP CONSTRAINT IF EXISTS shift_events_event_type_whitelist;