import { describe, it, expect } from 'vitest';
import { addBusinessDays, superDeadline } from './business-days';

describe('addBusinessDays', () => {
  it('Thu + 1 business day is Fri', () => {
    // 2026-06-18 is a Thursday.
    expect(addBusinessDays(new Date('2026-06-18T00:00:00Z'), 1).toISOString().slice(0, 10)).toBe(
      '2026-06-19',
    );
  });

  it('Thu + 2 business days lands on the following Monday, not Saturday', () => {
    expect(addBusinessDays(new Date('2026-06-18T00:00:00Z'), 2).toISOString().slice(0, 10)).toBe(
      '2026-06-22',
    );
  });

  it('Friday + 1 business day is the following Monday', () => {
    // 2026-06-19 is a Friday.
    expect(addBusinessDays(new Date('2026-06-19T00:00:00Z'), 1).toISOString().slice(0, 10)).toBe(
      '2026-06-22',
    );
  });
});

describe('superDeadline (7 business days)', () => {
  it('seven business days after a Tuesday payday is the following Thursday', () => {
    // 2026-06-16 is a Tuesday → +7 business days → Thu 2026-06-25.
    expect(superDeadline(new Date('2026-06-16T00:00:00Z')).toISOString().slice(0, 10)).toBe(
      '2026-06-25',
    );
  });

  it('is always later than the naive 7-calendar-day date (spans a weekend)', () => {
    const anchor = new Date('2026-06-16T00:00:00Z');
    const calendar7 = new Date(anchor.getTime() + 7 * 86400000);
    expect(superDeadline(anchor).getTime()).toBeGreaterThan(calendar7.getTime());
  });
});
