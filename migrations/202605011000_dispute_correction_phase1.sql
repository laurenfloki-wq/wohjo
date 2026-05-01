-- Dispute correction workflow Phase 1 — substrate migration.
--
-- Per ~/FLOSMOSIS/operations/dispute-correction-workflow-v1.md, the
-- workflow extends the immutable shift_events chain with corrective
-- records when a worker disputes a sealed shift, when a system bug is
-- found post-seal, or when a supervisor approval needs re-approval.
--
-- This migration adds:
--   1. Three new event_type values to the CHECK constraint:
--        - CORRECTION: admin-issued correction in response to a worker
--          dispute (Scenario A)
--        - BUG_CORRECTION: admin-issued correction in response to a
--          system-bug-affected sealed shift (Scenario B)
--        - SUPERVISOR_RE_APPROVAL: re-approval extending the chain when
--          a prior SUPERVISOR_APPROVAL is contested or wrong
--          (Scenario C)
--   2. parent_shift_event_id UUID NULL — chains the corrective event to
--      the original event being corrected. NULL for non-corrective events
--      (every existing row stays NULL until a correction lands).
--   3. correction_reason TEXT NULL — admin's documented reason for the
--      correction. NULL for non-corrective events. NOT NULL would be
--      enforced in code (zod) at the corrective endpoint, since the
--      column must accept NULL for the eight pre-Phase-1 event types.
--
-- Hard rules per CLAUDE.md non-negotiable #6 (no data ever deleted) and
-- non-negotiable #3 (every WLES event has a SHA-256 hash):
--   - Original shift_events rows are NEVER modified by this migration.
--   - Corrective events extend the chain via the standard
--     previous_event_hash mechanism. parent_shift_event_id is metadata,
--     not a substitute for chain linkage.
--   - SHA-256 hashing of CORRECTION/BUG_CORRECTION/SUPERVISOR_RE_APPROVAL
--     events follows the same generateEventHash() pattern as every
--     other event type (no special-casing).
--
-- DO NOT auto-apply. Lauren applies after staging-clone validation.
--
-- Joao E2E test sacred zone untouched — none of the existing event
-- types (START_EVENT, END_EVENT, SHIFT_COMMIT, SUPERVISOR_APPROVAL,
-- INTELLIGENCE_CLEAR, ANOMALY_FLAG, DISPUTE_RAISED, EXPORT_RECORD)
-- are modified. The CHECK constraint is REPLACED to widen the allowed
-- set; existing rows continue to satisfy the new (broader) constraint.

-- Step 1: drop the existing CHECK constraint
ALTER TABLE public.shift_events
  DROP CONSTRAINT IF EXISTS shift_events_event_type_check;

-- Step 2: add the broader CHECK with three new event types
ALTER TABLE public.shift_events
  ADD CONSTRAINT shift_events_event_type_check
  CHECK (event_type IN (
    'START_EVENT',
    'END_EVENT',
    'SHIFT_COMMIT',
    'SUPERVISOR_APPROVAL',
    'INTELLIGENCE_CLEAR',
    'ANOMALY_FLAG',
    'DISPUTE_RAISED',
    'EXPORT_RECORD',
    -- Phase 1 additions:
    'CORRECTION',
    'BUG_CORRECTION',
    'SUPERVISOR_RE_APPROVAL'
  ));

-- Step 3: add parent_shift_event_id for correction chaining
ALTER TABLE public.shift_events
  ADD COLUMN IF NOT EXISTS parent_shift_event_id UUID NULL
  REFERENCES public.shift_events(id);

-- Step 4: add correction_reason for documenting WHY
ALTER TABLE public.shift_events
  ADD COLUMN IF NOT EXISTS correction_reason TEXT NULL;

-- Step 5: index parent_shift_event_id for "find all corrections of a
-- given event" queries (regulator pulls audit trail by original
-- event id).
CREATE INDEX IF NOT EXISTS idx_shift_events_parent
  ON public.shift_events (parent_shift_event_id)
  WHERE parent_shift_event_id IS NOT NULL;

-- Step 6: enforce that corrective events MUST have a parent + reason.
-- Non-corrective events MUST NOT have a parent (CORRECTION semantics
-- are reserved for the three new event types). This guard is
-- application-level (the API endpoint enforces) PLUS database-level
-- (this CHECK) to prevent code-bug regressions.
ALTER TABLE public.shift_events
  ADD CONSTRAINT shift_events_correction_consistency_check
  CHECK (
    -- Corrective events: parent + reason both required
    (event_type IN ('CORRECTION', 'BUG_CORRECTION', 'SUPERVISOR_RE_APPROVAL')
      AND parent_shift_event_id IS NOT NULL
      AND correction_reason IS NOT NULL
      AND length(correction_reason) > 0)
    OR
    -- Non-corrective events: both must be NULL (no false-positive corrections)
    (event_type NOT IN ('CORRECTION', 'BUG_CORRECTION', 'SUPERVISOR_RE_APPROVAL')
      AND parent_shift_event_id IS NULL
      AND correction_reason IS NULL)
  );
