-- M0d — reconcile shift_events_event_type_check to Option B shape.
--
-- M0c (m0_post_cutover_v1_constraints_and_event_type_extension) added
-- X-FLOSMOSIS-* variants for core lifecycle events (PAYROLL_APPROVAL,
-- SUPERVISOR_APPROVAL, DISPUTE_RAISED, EXPORT_RECORD, CORRECTION,
-- BUG_CORRECTION, WORKER_DISPUTE_FILED). Substrate review identified
-- that those X-prefixed substrate values would decouple from the two
-- existing event_type-keyed CHECK constraints:
--   shift_events_correction_consistency_check (keys off bare names
--     CORRECTION / BUG_CORRECTION / SUPERVISOR_RE_APPROVAL)
--   shift_events_event_data_shape (keys off bare names
--     SUPERVISOR_APPROVAL / DISPUTE_RAISED / SHIFT_COMMIT)
-- A row written with substrate event_type='X-FLOSMOSIS-CORRECTION' and
-- parent_shift_event_id + correction_reason set would fail
-- correction_consistency_check (the constraint sees a non-correction
-- type that must NOT carry those fields).
--
-- Fix: insertV1Event gains an eventTypeForSubstrate override; every
-- route now passes the legacy canonical name (PAYROLL_APPROVAL etc.)
-- into the substrate column. The wles_event jsonb keeps the WLES
-- extension type (X-FLOSMOSIS-*) for verifier conformance.
--
-- Substrate column enum can therefore drop the orphaned X-FLOSMOSIS-*
-- core lifecycle entries. Protocol/meta extensions
-- (SPEC_VERSION_MIGRATION, SPEC_VERSION_ANOMALY) stay — they are the
-- only events whose substrate column is genuinely an X- extension
-- (they have no FLOSTRUCTION-canonical bare name).
--
-- SAFETY: no live row uses any of the orphaned X-FLOSMOSIS-* values
-- as its substrate event_type. The bridge (ec801f17, X-FLOSMOSIS-
-- SPEC_VERSION_MIGRATION) and the anomaly annotation
-- (b3bdd8f6, X-FLOSMOSIS-SPEC_VERSION_ANOMALY) are the only X-*
-- substrate rows, both retained by the new enum. Pre-flight check
-- inside this migration aborts if that assumption is violated.

DO $$
DECLARE
  rogue_count integer;
BEGIN
  SELECT count(*) INTO rogue_count
  FROM public.shift_events
  WHERE event_type IN (
    'X-FLOSMOSIS-EXPORT_RECORD',
    'X-FLOSMOSIS-DISPUTE_RAISED',
    'X-FLOSMOSIS-PAYROLL_APPROVAL',
    'X-FLOSMOSIS-SUPERVISOR_APPROVAL',
    'X-FLOSMOSIS-CORRECTION',
    'X-FLOSMOSIS-BUG_CORRECTION',
    'X-FLOSMOSIS-WORKER_DISPUTE_FILED'
  );
  IF rogue_count > 0 THEN
    RAISE EXCEPTION
      'M0d aborted: % live row(s) carry an X-FLOSMOSIS core-lifecycle substrate event_type. Reconcile data before dropping enum entries.',
      rogue_count;
  END IF;
END $$;

ALTER TABLE public.shift_events DROP CONSTRAINT IF EXISTS shift_events_event_type_check;
ALTER TABLE public.shift_events
  ADD CONSTRAINT shift_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    -- FLOSTRUCTION canonical lifecycle names. Substrate column ALWAYS
    -- uses these for core events. wles_event jsonb may carry an
    -- equivalent WLES committed type or X-FLOSMOSIS-* extension.
    'START_EVENT'::text,
    'END_EVENT'::text,
    'SHIFT_COMMIT'::text,
    'SUPERVISOR_APPROVAL'::text,
    'PAYROLL_APPROVAL'::text,
    'INTELLIGENCE_CLEAR'::text,
    'ANOMALY_FLAG'::text,
    'DISPUTE_RAISED'::text,
    'EXPORT_RECORD'::text,
    'CORRECTION'::text,
    'BUG_CORRECTION'::text,
    'SUPERVISOR_RE_APPROVAL'::text,
    'WORKER_DISPUTE_FILED'::text,
    'WORKER_CREATED'::text,
    -- Protocol/meta WLES extension types — these have no
    -- FLOSTRUCTION-canonical bare-name equivalent and live as their
    -- X-FLOSMOSIS-* form in both columns.
    'X-FLOSMOSIS-SPEC_VERSION_MIGRATION'::text,
    'X-FLOSMOSIS-SPEC_VERSION_ANOMALY'::text
  ]));