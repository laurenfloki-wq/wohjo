-- CRACK 219 WS2: unique index on EXPORT_RECORD events
-- Defense in depth: prevents the same shift from getting more than one
-- EXPORT_RECORD event unless the second is explicitly historical_duplicate=true
-- (the correction-workflow escape hatch).

CREATE UNIQUE INDEX IF NOT EXISTS shift_events_export_record_unique
  ON public.shift_events (
    (event_data ->> 'shift_id')
  )
  WHERE event_type = 'EXPORT_RECORD'
    AND NOT (event_data ? 'historical_duplicate');

COMMENT ON INDEX public.shift_events_export_record_unique IS
  'Prevents duplicate EXPORT_RECORD events for the same shift. The historical_duplicate escape hatch (used by the correction workflow) is excluded from the constraint so correction events can safely coexist with the original export record.';