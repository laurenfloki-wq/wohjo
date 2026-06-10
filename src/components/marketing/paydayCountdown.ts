// Payday Super countdown — flostruction-v5.html:820-828 (v5.1, Lauren
// 2026-06-10). Pure function so the post-deadline state is unit-testable
// with a mocked clock: the site must never show a negative count on
// 2 July (brief, Item 2 "Post-deadline state (required)").
//
// The fixed +10:00 offset is deliberate: the deadline is AEST and
// 1 July is outside daylight saving.
export const PAYDAY_SUPER_TARGET = new Date('2026-07-01T00:00:00+10:00').getTime();

export interface PaydayClock {
  num: string;
  label: string;
}

export function paydayCountdown(now: number): PaydayClock {
  const days = Math.ceil((PAYDAY_SUPER_TARGET - now) / 86400000);
  if (days > 0) {
    return {
      num: String(days),
      label: days === 1 ? 'day until Payday Super' : 'days until Payday Super',
    };
  }
  return { num: 'NOW', label: 'Payday Super is in effect' };
}
