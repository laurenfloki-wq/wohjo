-- =============================================================================
-- MIGRATION CRACK 218 — add PAYROLL_APPROVAL to shift_events event_type CHECK
-- 2026-05-11 · Monday AM dispatch
--
-- Architectural fix for the Final Approve regression (introduced by PR #26):
--   * Final approvals were being shoehorned into SUPERVISOR_APPROVAL with
--     event_data.layer = 'FINAL' / method = 'PAYROLL_ADMIN'. To pass the
--     existing partial-unique index on (event_data->>'shift_id') WHERE
--     event_type='SUPERVISOR_APPROVAL' AND NOT event_data ? 'historical_duplicate',
--     historical SUPERVISOR_APPROVAL events were retro-tagged with
--     historical_duplicate=true (CRACK 72). That mutates immutable rows
--     and violates WLES Non-Negotiable #2.
--   * The unique index shift_events_payroll_approval_unique already exists
--     for event_type='PAYROLL_APPROVAL' but the CHECK constraint excludes
--     PAYROLL_APPROVAL — the dormant index never had a live event type to
--     guard, so PAYROLL_APPROVAL was effectively un-insertable. CRACK 170
--     (`remove_payroll_approval_dead_reference`, 20260507231730) removed
--     PAYROLL_APPROVAL from the CHECK believing it was unused — but left
--     the unique index intact. This migration is the inverse: re-admit
--     PAYROLL_APPROVAL to the CHECK so the dormant index becomes live.
--
-- Consistency with prior practice:
--   Adding a new event_type to this CHECK has happened multiple times
--   without a Lauren WLES-gate event (CORRECTION/BUG_CORRECTION/
--   SUPERVISOR_RE_APPROVAL @ 202605011000; X-FLOSMOSIS-SPEC_VERSION_MIGRATION
--   via CRACK 169; WORKER_DISPUTE_FILED via CRACK 195). Lauren's standing
--   gate is on enum/runtime-data values like approval_method='bulk', NOT on
--   CHECK constraint expansions.
--
-- Hard rules per CLAUDE.md non-negotiable #2 (no event ever modified) and
-- #6 (no auto-apply):
--   * Existing rows are NEVER modified by this migration.
--   * The CHECK is REPLACED to widen the allowed set; every existing row
--     continues to satisfy the new (broader) constraint.
--   * DO NOT auto-apply. Lauren applies via Supabase SQL Editor after
--     staging-clone validation.
--
-- Joao E2E test sacred zone: untouched. The migration is purely
-- additive at the schema level.

BEGIN;

-- Step 1: drop the existing CHECK constraint
ALTER TABLE public.shift_events
  DROP CONSTRAINT IF EXISTS shift_events_event_type_check;

-- Step 2: add the broader CHECK with PAYROLL_APPROVAL admitted.
--         Ordered to match the production CHECK constraint as documented
--         in the 2026-05-11 dispatch root-cause analysis (so future diffs
--         show only the PAYROLL_APPROVAL line as added).
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

COMMIT;

-- Post-apply verification:
--   SELECT pg_get_constraintdef(c.oid)
--   FROM pg_constraint c
--   JOIN pg_class t ON t.oid = c.conrelid
--   WHERE t.relname = 'shift_events'
--     AND c.conname = 'shift_events_event_type_check';
--
--   -- Confirm the dormant unique index now has a live event type to guard:
--   SELECT indexdef FROM pg_indexes
--   WHERE indexname = 'shift_events_payroll_approval_unique';
