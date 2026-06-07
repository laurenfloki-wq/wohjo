
ALTER TABLE shift_events
  DROP CONSTRAINT shift_events_event_type_check,
  ADD CONSTRAINT shift_events_event_type_check
    CHECK (event_type = ANY (ARRAY[
      'START_EVENT'::text,
      'END_EVENT'::text,
      'SHIFT_COMMIT'::text,
      'SUPERVISOR_APPROVAL'::text,
      'INTELLIGENCE_CLEAR'::text,
      'ANOMALY_FLAG'::text,
      'DISPUTE_RAISED'::text,
      'EXPORT_RECORD'::text,
      'CORRECTION'::text,
      'BUG_CORRECTION'::text,
      'SUPERVISOR_RE_APPROVAL'::text,
      'X-FLOSMOSIS-SPEC_VERSION_MIGRATION'::text,
      'WORKER_DISPUTE_FILED'::text
    ]));
