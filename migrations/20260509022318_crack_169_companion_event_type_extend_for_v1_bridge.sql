-- =============================================================================
-- MIGRATION — V1 FLIP COMPANION (CRACK 169 deferred block)
-- Apply BEFORE setting WLES_V1_ENABLED=true.
-- Companion to the CRACK 165 trigger migration.
--
-- Strategy: extend shift_events_event_type_check to permit the bridge
-- event_type 'X-FLOSMOSIS-SPEC_VERSION_MIGRATION'. CRACK 169 already removed
-- the duplicate narrow whitelist; this extends the canonical broader CHECK.
-- =============================================================================

BEGIN;

ALTER TABLE public.shift_events
  DROP CONSTRAINT shift_events_event_type_check;

ALTER TABLE public.shift_events
  ADD CONSTRAINT shift_events_event_type_check
  CHECK (event_type = ANY(ARRAY[
    'START_EVENT','END_EVENT','SHIFT_COMMIT','SUPERVISOR_APPROVAL',
    'INTELLIGENCE_CLEAR','ANOMALY_FLAG','DISPUTE_RAISED','EXPORT_RECORD',
    'CORRECTION','BUG_CORRECTION','SUPERVISOR_RE_APPROVAL',
    'X-FLOSMOSIS-SPEC_VERSION_MIGRATION'
  ]));

COMMIT;