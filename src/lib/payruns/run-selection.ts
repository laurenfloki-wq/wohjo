// Pay-run shift selection — the completeness core (Payday Super, 2026-06-18).
//
// A run starts from EVERY approved-not-exported shift (no date window, so
// nothing is silently dropped) and removes only the shifts the operator
// deliberately holds. The pay period is then derived from the actual dates
// of the included shifts, so the export and its period label are truthful.

import type { ApprovedShift } from '@/lib/export/types';

export interface RunSelection {
  /** Shifts that will be sealed into this run. */
  included: ApprovedShift[];
  /** Shifts the operator held back — they stay PAYROLL_APPROVED for a later
   *  run, never dropped. */
  heldOut: ApprovedShift[];
  /** Earliest included shift date (YYYY-MM-DD), or null if none included. */
  payPeriodStart: string | null;
  /** Latest included shift date (YYYY-MM-DD), or null if none included. */
  payPeriodEnd: string | null;
}

export function selectRunShifts(
  approved: ReadonlyArray<ApprovedShift>,
  holdShiftIds: ReadonlyArray<string> = [],
): RunSelection {
  const held = new Set(holdShiftIds);
  const included: ApprovedShift[] = [];
  const heldOut: ApprovedShift[] = [];
  for (const s of approved) {
    if (held.has(s.id)) heldOut.push(s);
    else included.push(s);
  }
  const dates = included
    .map((s) => s.shift_date)
    .filter((d): d is string => typeof d === 'string' && d.length > 0)
    .sort();
  return {
    included,
    heldOut,
    payPeriodStart: dates[0] ?? null,
    payPeriodEnd: dates[dates.length - 1] ?? null,
  };
}

/** A shift is "aged" — outside the current week and so worth a deliberate
 *  include/hold decision — when its date is before `cutoff` (YYYY-MM-DD). */
export function isAgedShift(shiftDate: string | null, cutoff: string): boolean {
  return typeof shiftDate === 'string' && shiftDate < cutoff;
}
