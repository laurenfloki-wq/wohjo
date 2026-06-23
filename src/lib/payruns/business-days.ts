// Payday Super deadline maths.
//
// The Treasury Laws Amendment (Payday Superannuation) Act 2025 (commences
// 1 July 2026) requires an employee's super to be received by their fund
// within SEVEN BUSINESS DAYS of the qualifying-earnings day (payday) — not
// seven calendar days. This module computes that deadline honestly.
//
// Scope note: this counts weekends only, not public holidays (which vary by
// state and have no national calendar in the substrate). Excluding holidays
// lands the deadline slightly EARLIER than the true statutory date, so the
// estimate is conservative — it never tells an operator they have longer
// than they really do. The displayed date is labelled an estimate for that
// reason.

const SUPER_DEADLINE_BUSINESS_DAYS = 7;

/** Add `n` business days (skipping Sat/Sun) to a date. */
export function addBusinessDays(from: Date, n: number): Date {
  const d = new Date(from.getTime());
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay(); // 0 Sun … 6 Sat
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

/** The Payday Super "super must be received by" deadline: seven business
 *  days after the given anchor (payday / the run's export date). */
export function superDeadline(anchor: Date): Date {
  return addBusinessDays(anchor, SUPER_DEADLINE_BUSINESS_DAYS);
}
