-- /field PWA redesign — ARCH-1 fix
-- Add 'IN_PROGRESS' to the shifts.status CHECK enum and backfill any
-- currently-open shifts (end_time IS NULL AND status='SUBMITTED') to
-- the new explicit state.
--
-- Rationale: prior to this migration, 'in progress' and 'ended/awaiting
-- approval' both have status='SUBMITTED' — they are only distinguished
-- by end_time being null or non-null. That is fragile and is the
-- proximate cause of the state-machine contradiction surfaced on the
-- Timesheet Receipt screen. Making the state machine server-authoritative
-- requires an explicit IN_PROGRESS state.
--
-- After this migration:
--   shift/start → INSERT status='IN_PROGRESS', end_time=null
--   shift/end   → UPDATE status='SUBMITTED', end_time=<now>
--                 (rejected unless status='IN_PROGRESS')
--   supervisor approve → status='SUPERVISOR_APPROVED'
--   payroll approve    → status='PAYROLL_APPROVED'
--   export              → status='EXPORTED'

BEGIN;

-- 1. Drop existing CHECK constraint.
ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_status_check;

-- 2. Re-add with IN_PROGRESS included.
ALTER TABLE shifts
  ADD CONSTRAINT shifts_status_check
  CHECK (status IN (
    'IN_PROGRESS',
    'SUBMITTED',
    'SUPERVISOR_APPROVED',
    'PAYROLL_APPROVED',
    'EXPORTED',
    'DISPUTED',
    'ADJUSTED'
  ));

-- 3. Backfill any currently-open shifts (end_time IS NULL) that are
--    stuck at 'SUBMITTED' to the new IN_PROGRESS state. Only touches
--    open shifts — completed shifts (end_time IS NOT NULL) keep their
--    existing status regardless.
--
--    IMPORTANT: this is gated on is_active=true via the worker/company
--    join to avoid re-animating soft-deleted fixture shifts. Any shift
--    whose worker or company was soft-deleted in the Tier 1 cleanup
--    stays at status='SUBMITTED' and will be excluded from the home
--    page's active-shift lookup by the is_active filter on workers.
UPDATE shifts s
SET status = 'IN_PROGRESS'
WHERE s.end_time IS NULL
  AND s.status = 'SUBMITTED'
  AND EXISTS (
    SELECT 1 FROM workers w
    WHERE w.id = s.worker_id
      AND w.is_active = true
  );

-- 4. Verification: count how many rows got backfilled.
--    (The SELECT runs inside the same transaction; the result is
--    returned to the SQL editor for Lauren's review.)
SELECT 'IN_PROGRESS backfill count' AS label,
       count(*) AS rows_affected
FROM shifts
WHERE status = 'IN_PROGRESS';

COMMIT;
