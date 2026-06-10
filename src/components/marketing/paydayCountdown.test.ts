// Payday Super countdown — clock-mocked unit coverage (v5.1 brief,
// Item 2: "mock the clock in a unit test").
import { describe, it, expect } from 'vitest';
import { paydayCountdown, PAYDAY_SUPER_TARGET } from './paydayCountdown';

const DAY = 86_400_000;

describe('paydayCountdown (marketing v5.1)', () => {
  it('counts whole days remaining before the deadline (ceil of partial days)', () => {
    expect(paydayCountdown(PAYDAY_SUPER_TARGET - 21 * DAY)).toEqual({
      num: '21',
      label: 'days until Payday Super',
    });
    // a partial day still counts as a full day remaining
    expect(paydayCountdown(PAYDAY_SUPER_TARGET - 20.2 * DAY).num).toBe('21');
  });

  it('uses the singular label on the final day', () => {
    expect(paydayCountdown(PAYDAY_SUPER_TARGET - 0.5 * DAY)).toEqual({
      num: '1',
      label: 'day until Payday Super',
    });
  });

  it('renders NOW once the deadline passes — never a negative count', () => {
    for (const t of [PAYDAY_SUPER_TARGET, PAYDAY_SUPER_TARGET + 1, PAYDAY_SUPER_TARGET + 30 * DAY]) {
      expect(paydayCountdown(t)).toEqual({ num: 'NOW', label: 'Payday Super is in effect' });
    }
  });

  it('targets midnight 1 July 2026 AEST (+10:00 — outside daylight saving)', () => {
    expect(PAYDAY_SUPER_TARGET).toBe(Date.parse('2026-06-30T14:00:00Z'));
  });
});
