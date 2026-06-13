import { describe, expect, it } from 'vitest';
import { formatHours, lifetimeHoursByWorker, sinceLabel } from './people-data';

describe('lifetime verified hours', () => {
  it('sums only verified statuses per worker', () => {
    const out = lifetimeHoursByWorker([
      { worker_id: 'w1', total_hours: 8, status: 'EXPORTED' },
      { worker_id: 'w1', total_hours: '7.5', status: 'SUBMITTED' },
      { worker_id: 'w1', total_hours: 4, status: 'IN_PROGRESS' },
      { worker_id: 'w2', total_hours: 6, status: 'APPROVED' },
      { worker_id: null, total_hours: 9, status: 'EXPORTED' },
    ]);
    expect(out).toEqual({ w1: 15.5, w2: 6 });
  });

  it('never invents hours for workers with no sealed shifts', () => {
    expect(lifetimeHoursByWorker([])).toEqual({});
  });
});

describe('formatting', () => {
  it('formats hours as decimal(2) with grouping', () => {
    expect(formatHours(1284.5)).toBe('1,284.50');
    expect(formatHours(0)).toBe('0.00');
  });

  it('renders a Sydney month-year since label', () => {
    expect(sinceLabel('2026-02-10T00:00:00Z')).toMatch(/Feb 2026/);
  });
});
