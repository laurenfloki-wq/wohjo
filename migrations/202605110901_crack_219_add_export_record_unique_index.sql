-- CRACK 219 WS2 — unique index on EXPORT_RECORD events
-- 2026-05-11 · Monday AM dispatch
--
-- Adds a partial unique index that prevents the same shift from receiving
-- more than one EXPORT_RECORD event (unless the second is explicitly marked
-- historical_duplicate=true, which is the correction-workflow escape hatch).
--
-- Without this index, a double-export race (two concurrent calls with
-- overlapping shift_ids) could — in a pre-WS1 world — insert duplicate
-- EXPORT_RECORD events before the shift's status update takes effect.
-- Post-WS1 (process_flostruction_export RPC), the FOR UPDATE row-lock
-- prevents the race, but defence-in-depth is warranted for a table that
-- is the audit backbone of the payroll substrate.
--
-- The index matches the pattern used by the existing singleton-event
-- constraints in 202604251200_singleton_event_unique_constraints.sql.
--
-- DO NOT auto-apply. Apply via Supabase SQL Editor after WS1
-- (process_flostruction_export RPC) is live. Apply to
-- rwnxnnudljpgyfwbnosu.
--
-- Joao E2E test sacred zone: untouched. No existing EXPORT_RECORD rows
-- exist for Joao's shift (FSTR-JRYMJXWR is PAYROLL_APPROVED, not
-- EXPORTED). Adding this index is purely additive.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS shift_events_export_record_unique
  ON public.shift_events (
    (event_data ->> 'shift_id')
  )
  WHERE event_type = 'EXPORT_RECORD'
    AND NOT (event_data ? 'historical_duplicate');

COMMENT ON INDEX public.shift_events_export_record_unique IS
  'Prevents duplicate EXPORT_RECORD events for the same shift. '
  'The historical_duplicate escape hatch (used by the correction workflow) '
  'is excluded from the constraint so correction events can safely coexist '
  'with the original export record.';

COMMIT;

-- Post-apply verification:
--   SELECT indexname, indexdef
--   FROM pg_indexes
--   WHERE indexname = 'shift_events_export_record_unique';
