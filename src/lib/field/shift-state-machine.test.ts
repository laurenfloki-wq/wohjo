// Shift state machine regression tests (Part C4).
//
// Covers every valid + invalid transition and the A3 / ARCH-2
// regressions specifically flagged in the /field redesign brief.

import { describe, it, expect } from 'vitest';
import {
  classifyEndShift,
  isValidTransition,
  MIN_SHIFT_HOURS,
  MAX_SHIFT_HOURS,
  type ShiftSnapshot,
  type ShiftStatus,
} from './shift-state-machine';

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------
const iso = (ms: number) => new Date(ms).toISOString();
const BASE = new Date('2026-04-22T07:00:00+10:00').getTime();

function inProgress(startMs: number = BASE): ShiftSnapshot {
  return {
    id: 'shift-1',
    status: 'IN_PROGRESS',
    start_time: iso(startMs),
    end_time: null,
  };
}
function submitted(startMs: number = BASE): ShiftSnapshot {
  return {
    id: 'shift-1',
    status: 'SUBMITTED',
    start_time: iso(startMs),
    end_time: iso(startMs + 8 * 3_600_000),
  };
}

// ---------------------------------------------------------------------
// classifyEndShift — happy path
// ---------------------------------------------------------------------
describe('classifyEndShift — valid shift end', () => {
  it('accepts an 8-hour shift with 30-minute break', () => {
    const d = classifyEndShift({
      shift: inProgress(BASE),
      endIso: iso(BASE + 8 * 3_600_000),
      breakMinutes: 30,
    });
    expect(d.kind).toBe('accept');
    if (d.kind === 'accept') expect(d.totalHours).toBe(7.5);
  });

  it('accepts a 6-minute shift with no break (boundary: MIN_SHIFT_HOURS)', () => {
    const d = classifyEndShift({
      shift: inProgress(BASE),
      endIso: iso(BASE + 6 * 60_000), // 6 minutes = 0.1 hours
      breakMinutes: 0,
    });
    expect(d.kind).toBe('accept');
    if (d.kind === 'accept') expect(d.totalHours).toBeCloseTo(MIN_SHIFT_HOURS, 2);
  });

  it('accepts a 24-hour shift with no break (boundary: MAX_SHIFT_HOURS)', () => {
    const d = classifyEndShift({
      shift: inProgress(BASE),
      endIso: iso(BASE + 24 * 3_600_000),
      breakMinutes: 0,
    });
    expect(d.kind).toBe('accept');
    if (d.kind === 'accept') expect(d.totalHours).toBe(MAX_SHIFT_HOURS);
  });

  it('rounds total hours to 2 decimal places', () => {
    const d = classifyEndShift({
      shift: inProgress(BASE),
      endIso: iso(BASE + (7 * 3_600_000 + 37 * 60_000)), // 7:37
      breakMinutes: 30,
    });
    expect(d.kind).toBe('accept');
    if (d.kind === 'accept') {
      // 7.6166... - 0.5 = 7.1166... → 7.12
      expect(d.totalHours).toBe(7.12);
    }
  });
});

// ---------------------------------------------------------------------
// A3 regression — zero or negative duration rejected
// ---------------------------------------------------------------------
describe('A3 regression — zero / negative duration', () => {
  it('rejects when end_time equals start_time', () => {
    const d = classifyEndShift({
      shift: inProgress(BASE),
      endIso: iso(BASE),
      breakMinutes: 0,
    });
    expect(d).toEqual({ kind: 'reject', reason: 'END_BEFORE_START' });
  });

  it('rejects when end_time precedes start_time', () => {
    const d = classifyEndShift({
      shift: inProgress(BASE),
      endIso: iso(BASE - 60_000),
      breakMinutes: 0,
    });
    expect(d).toEqual({ kind: 'reject', reason: 'END_BEFORE_START' });
  });

  it('rejects the reproducer scenario: tap Start then End with break=30', () => {
    // 1 minute elapsed, break 30 min → totalHours would be -0.48
    const d = classifyEndShift({
      shift: inProgress(BASE),
      endIso: iso(BASE + 60_000),
      breakMinutes: 30,
    });
    // End is after start so this passes END_BEFORE_START but fails
    // BELOW_MINIMUM_DURATION. Either way, NEVER returns success.
    expect(d.kind).toBe('reject');
    if (d.kind === 'reject') {
      expect(d.reason).toBe('BELOW_MINIMUM_DURATION');
    }
  });

  it('never returns total_hours = 0 as success', () => {
    const d = classifyEndShift({
      shift: inProgress(BASE),
      endIso: iso(BASE + 30 * 60_000), // 30 minutes
      breakMinutes: 30, // exactly cancels
    });
    expect(d.kind).toBe('reject');
    if (d.kind === 'accept') {
      throw new Error('A3 regression: 0-hour shift was accepted as success');
    }
  });

  it('rejects just-under-minimum duration (5 minutes 59 seconds)', () => {
    const d = classifyEndShift({
      shift: inProgress(BASE),
      endIso: iso(BASE + (5 * 60_000 + 59_000)),
      breakMinutes: 0,
    });
    expect(d).toEqual({ kind: 'reject', reason: 'BELOW_MINIMUM_DURATION' });
  });
});

// ---------------------------------------------------------------------
// ARCH-2 regression — double-tap End Shift rejected
// ---------------------------------------------------------------------
describe('ARCH-2 regression — re-call protection', () => {
  it('rejects end-shift on an already-SUBMITTED shift', () => {
    const d = classifyEndShift({
      shift: submitted(),
      endIso: iso(BASE + 9 * 3_600_000),
      breakMinutes: 30,
    });
    expect(d).toEqual({ kind: 'reject', reason: 'NOT_IN_PROGRESS' });
  });

  it('rejects end-shift on SUPERVISOR_APPROVED shift', () => {
    const d = classifyEndShift({
      shift: { ...submitted(), status: 'SUPERVISOR_APPROVED' },
      endIso: iso(BASE + 9 * 3_600_000),
      breakMinutes: 30,
    });
    expect(d).toEqual({ kind: 'reject', reason: 'NOT_IN_PROGRESS' });
  });

  it('rejects when status=IN_PROGRESS but end_time is populated (race window)', () => {
    const d = classifyEndShift({
      shift: {
        id: 'shift-1',
        status: 'IN_PROGRESS',
        start_time: iso(BASE),
        end_time: iso(BASE + 8 * 3_600_000),
      },
      endIso: iso(BASE + 9 * 3_600_000),
      breakMinutes: 30,
    });
    expect(d).toEqual({ kind: 'reject', reason: 'NOT_IN_PROGRESS' });
  });
});

// ---------------------------------------------------------------------
// Break validation
// ---------------------------------------------------------------------
describe('break minutes validation', () => {
  it.each([0, 15, 30, 45, 60])('accepts break=%i', (mins) => {
    const d = classifyEndShift({
      shift: inProgress(BASE),
      endIso: iso(BASE + 8 * 3_600_000),
      breakMinutes: mins,
    });
    expect(d.kind).toBe('accept');
  });

  it.each([5, 10, 20, 90, -15])('rejects break=%i', (mins) => {
    const d = classifyEndShift({
      shift: inProgress(BASE),
      endIso: iso(BASE + 8 * 3_600_000),
      breakMinutes: mins,
    });
    expect(d).toEqual({ kind: 'reject', reason: 'INVALID_BREAK' });
  });
});

// ---------------------------------------------------------------------
// Upper bound — clock-skew / absurd duration
// ---------------------------------------------------------------------
describe('maximum duration cap', () => {
  it('rejects a 25-hour shift', () => {
    const d = classifyEndShift({
      shift: inProgress(BASE),
      endIso: iso(BASE + 25 * 3_600_000),
      breakMinutes: 0,
    });
    expect(d).toEqual({ kind: 'reject', reason: 'EXCEEDS_MAXIMUM_DURATION' });
  });
});

// ---------------------------------------------------------------------
// isValidTransition — exhaustive
// ---------------------------------------------------------------------
describe('isValidTransition — valid paths', () => {
  const validPairs: Array<[ShiftStatus | 'NOT_STARTED', ShiftStatus]> = [
    ['NOT_STARTED', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'SUBMITTED'],
    ['SUBMITTED', 'SUPERVISOR_APPROVED'],
    ['SUBMITTED', 'DISPUTED'],
    ['SUPERVISOR_APPROVED', 'PAYROLL_APPROVED'],
    ['SUPERVISOR_APPROVED', 'DISPUTED'],
    ['PAYROLL_APPROVED', 'EXPORTED'],
    ['EXPORTED', 'ADJUSTED'],
    ['DISPUTED', 'ADJUSTED'],
    ['ADJUSTED', 'SUPERVISOR_APPROVED'],
  ];

  it.each(validPairs)('%s → %s is valid', (from, to) => {
    expect(isValidTransition(from, to)).toBe(true);
  });
});

describe('isValidTransition — invalid paths (must be rejected)', () => {
  const invalidPairs: Array<[ShiftStatus | 'NOT_STARTED', ShiftStatus]> = [
    ['NOT_STARTED', 'SUBMITTED'], // can't skip IN_PROGRESS
    ['NOT_STARTED', 'SUPERVISOR_APPROVED'],
    ['IN_PROGRESS', 'IN_PROGRESS'], // idempotent shift/start not permitted via transition
    ['IN_PROGRESS', 'SUPERVISOR_APPROVED'], // must go through SUBMITTED
    ['IN_PROGRESS', 'PAYROLL_APPROVED'],
    ['SUBMITTED', 'SUBMITTED'], // ARCH-2: double-end is not a valid self-transition
    ['SUBMITTED', 'IN_PROGRESS'], // can't re-open
    ['SUPERVISOR_APPROVED', 'SUBMITTED'], // can't regress
    ['SUPERVISOR_APPROVED', 'IN_PROGRESS'],
    ['PAYROLL_APPROVED', 'SUBMITTED'],
    ['PAYROLL_APPROVED', 'IN_PROGRESS'],
    ['EXPORTED', 'IN_PROGRESS'],
    ['EXPORTED', 'SUBMITTED'],
  ];

  it.each(invalidPairs)('%s → %s is rejected', (from, to) => {
    expect(isValidTransition(from, to)).toBe(false);
  });
});

// ---------------------------------------------------------------------
// L3.3 — DST regression tests
//
// Time-attack tests (L3.3, 2026-04-25) flagged that any payroll
// computation using wall-clock arithmetic across an Australian DST
// transition will misreport hours by ±1 — twice a year.
//
// Audit (L3.3-DST, 2026-04-25): total_hours is computed exactly once,
// in classifyEndShift below, via Date.getTime() UTC-epoch subtraction.
// Date.getTime() is UTC milliseconds since the epoch and is not
// affected by the local timezone's DST schedule. These regression
// tests pin that behaviour so a future refactor cannot silently
// introduce wall-clock arithmetic.
// ---------------------------------------------------------------------
describe('classifyEndShift — DST correctness (L3.3 regression)', () => {
  it('AEDT→AEST autumn transition yields 9 paid hours for an overnight shift, not 8', () => {
    // Worker on overnight shift 2026-04-04 21:00 AEDT (+11) →
    // 2026-04-05 06:00 AEST (+10). Australia rolls clocks back at
    // 03:00 AEDT → 02:00 AEST on the first Sunday of April, so the
    // wall-clock "9 hour" shift is actually 10 UTC-hours of paid
    // labour. After the 1-hour break the worker should see 9 paid
    // hours, not 8 (which is the wall-clock wrong answer).
    //
    // Note: both endpoints land on UTC April 4 because Australia is
    // 10–11h ahead of UTC; the local "Sat night → Sun morning"
    // overnight maps to a single UTC day.
    const startUtc = new Date('2026-04-04T10:00:00Z').getTime(); // 21:00 AEDT Sat
    const endUtc = new Date('2026-04-04T20:00:00Z').getTime();   // 06:00 AEST Sun
    const result = classifyEndShift({
      shift: inProgress(startUtc),
      endIso: iso(endUtc),
      breakMinutes: 60,
    });
    expect(result.kind).toBe('accept');
    if (result.kind !== 'accept') return;
    // (10h elapsed UTC) - (1h break) = 9h paid. Wall-clock would
    // give (9h - 1h) = 8h. The 1h difference IS the worker's
    // pay correctness on a DST night.
    expect(result.totalHours).toBe(9);
  });

  it('AEST→AEDT spring transition yields 7 paid hours for an overnight shift, not 8', () => {
    // 2026-10-04 21:00 AEST (+10) → 2026-10-05 06:00 AEDT (+11).
    // Spring-forward: 02:00 AEST → 03:00 AEDT skips one hour, so the
    // wall-clock "9 hour" shift is actually 8 UTC-hours of labour.
    // After a 1h break the worker should see 7 paid hours.
    const startUtc = new Date('2026-10-04T11:00:00Z').getTime(); // 21:00 AEST Sat
    const endUtc = new Date('2026-10-04T19:00:00Z').getTime();   // 06:00 AEDT Sun
    const result = classifyEndShift({
      shift: inProgress(startUtc),
      endIso: iso(endUtc),
      breakMinutes: 60,
    });
    expect(result.kind).toBe('accept');
    if (result.kind !== 'accept') return;
    expect(result.totalHours).toBe(7);
  });

  it('non-DST midnight crossover is unaffected (sanity baseline)', () => {
    // Random midnight crossover with no DST transition. Both endpoints
    // in AEST. 23:00 → 06:00 with 30 min break = 6.5 paid hours.
    const startUtc = new Date('2026-06-15T13:00:00Z').getTime(); // 23:00 AEST
    const endUtc = new Date('2026-06-15T20:00:00Z').getTime();   // 06:00 AEST next day
    const result = classifyEndShift({
      shift: inProgress(startUtc),
      endIso: iso(endUtc),
      breakMinutes: 30,
    });
    expect(result.kind).toBe('accept');
    if (result.kind !== 'accept') return;
    expect(result.totalHours).toBe(6.5);
  });
});

