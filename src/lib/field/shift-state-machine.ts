// Flostruction Field — Shift state machine (pure, testable)
//
// The worker-side shift lifecycle. Functions here are pure — no IO,
// no dates read from wall clock except what the caller passes in —
// so the whole set can be exhaustively unit-tested. The shift/end
// route imports classifyEndShift to decide what to do before
// touching the DB.
//
// ARCH-1: server-authoritative state machine
// ARCH-2: re-call protection (double-tap End Shift rejected)
// A3:     zero/negative duration never accepted as success

export type ShiftStatus =
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'SUPERVISOR_APPROVED'
  | 'PAYROLL_APPROVED'
  | 'EXPORTED'
  | 'DISPUTED'
  | 'ADJUSTED';

export const VALID_BREAK_MINUTES = [0, 15, 30, 45, 60] as const;
export type BreakMinutes = typeof VALID_BREAK_MINUTES[number];

export const MIN_SHIFT_HOURS = 0.1;
export const MAX_SHIFT_HOURS = 24;

export interface ShiftSnapshot {
  id: string;
  status: ShiftStatus;
  start_time: string; // ISO
  end_time: string | null;
}

export type EndShiftDisposition =
  | {
      kind: 'accept';
      totalHours: number; // rounded to 2dp
    }
  | {
      kind: 'reject';
      reason:
        | 'NOT_IN_PROGRESS' // ARCH-2
        | 'END_BEFORE_START' // A3
        | 'BELOW_MINIMUM_DURATION' // A3
        | 'EXCEEDS_MAXIMUM_DURATION' // clock skew / bad input
        | 'INVALID_BREAK';
    };

/**
 * Classify an end-shift attempt without touching the database.
 *
 * Valid only when:
 *   - shift.status === 'IN_PROGRESS' AND shift.end_time IS NULL
 *   - breakMinutes is in VALID_BREAK_MINUTES
 *   - endMs > startMs (strictly, A3)
 *   - (endMs - startMs) / 3_600_000 - breakMinutes/60 >= MIN_SHIFT_HOURS
 *   - (endMs - startMs) / 3_600_000 - breakMinutes/60 <= MAX_SHIFT_HOURS
 */
export function classifyEndShift(args: {
  shift: ShiftSnapshot;
  endIso: string;
  breakMinutes: number;
}): EndShiftDisposition {
  const { shift, endIso, breakMinutes } = args;

  // ARCH-2: only IN_PROGRESS shifts (with null end_time) can be ended.
  if (shift.status !== 'IN_PROGRESS' || shift.end_time !== null) {
    return { kind: 'reject', reason: 'NOT_IN_PROGRESS' };
  }

  if (!(VALID_BREAK_MINUTES as readonly number[]).includes(breakMinutes)) {
    return { kind: 'reject', reason: 'INVALID_BREAK' };
  }

  const startMs = new Date(shift.start_time).getTime();
  const endMs = new Date(endIso).getTime();

  // A3: strictly positive duration. endMs <= startMs is catastrophic
  // for a wage-theft-prevention product. Reject before any DB write.
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { kind: 'reject', reason: 'END_BEFORE_START' };
  }
  if (endMs <= startMs) {
    return { kind: 'reject', reason: 'END_BEFORE_START' };
  }

  const totalHoursRaw = (endMs - startMs) / 3_600_000 - breakMinutes / 60;

  if (totalHoursRaw < MIN_SHIFT_HOURS) {
    return { kind: 'reject', reason: 'BELOW_MINIMUM_DURATION' };
  }

  if (totalHoursRaw > MAX_SHIFT_HOURS) {
    return { kind: 'reject', reason: 'EXCEEDS_MAXIMUM_DURATION' };
  }

  const totalHours = Math.round(totalHoursRaw * 100) / 100;
  return { kind: 'accept', totalHours };
}

/**
 * Valid-transition table. Used by tests + by code to assert that a
 * requested state change is legal.
 */
const VALID_TRANSITIONS: Record<ShiftStatus | 'NOT_STARTED', ShiftStatus[]> = {
  NOT_STARTED: ['IN_PROGRESS'],
  IN_PROGRESS: ['SUBMITTED'],
  SUBMITTED: ['SUPERVISOR_APPROVED', 'DISPUTED'],
  SUPERVISOR_APPROVED: ['PAYROLL_APPROVED', 'DISPUTED', 'ADJUSTED'],
  PAYROLL_APPROVED: ['EXPORTED', 'DISPUTED', 'ADJUSTED'],
  EXPORTED: ['DISPUTED', 'ADJUSTED'],
  DISPUTED: ['ADJUSTED', 'SUPERVISOR_APPROVED'],
  ADJUSTED: ['SUPERVISOR_APPROVED', 'PAYROLL_APPROVED', 'EXPORTED'],
};

export function isValidTransition(
  from: ShiftStatus | 'NOT_STARTED',
  to: ShiftStatus,
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
