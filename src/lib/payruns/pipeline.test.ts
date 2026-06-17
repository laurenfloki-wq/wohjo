import { describe, it, expect } from 'vitest';
import { bucketShifts, derivePayrunSituation, type RunBuckets } from './pipeline';
import type { ShiftRow } from '@/lib/page/today-data';

function shift(status: string, opts: Partial<ShiftRow> = {}): ShiftRow {
  return {
    id: opts.id ?? Math.random().toString(36).slice(2),
    status,
    total_hours: opts.total_hours ?? null,
    shift_date: opts.shift_date ?? '2026-06-17',
    receipt_id: opts.receipt_id ?? null,
    worker_id: opts.worker_id ?? null,
    site_id: opts.site_id ?? null,
    start_time: opts.start_time ?? null,
  };
}

const NO_DIRECTOR_SITES = new Set<string>();

function buckets(over: Partial<RunBuckets> = {}): RunBuckets {
  return {
    onSite: 0,
    awaitingSupervisor: 0,
    awaitingYou: 0,
    approvedToRun: 0,
    approvedHours: 0,
    submittedInWindow: 0,
    ...over,
  };
}

const HREFS = { approvalsHref: '#with-you', heldHref: '#handled', lastRun: null };

describe('bucketShifts', () => {
  it('buckets the open backlog by who each shift waits on', () => {
    const open = [
      shift('IN_PROGRESS'),
      shift('SUBMITTED'), // normal site → supervisor
      shift('SUPERVISOR_APPROVED'), // → you
    ];
    const b = bucketShifts(open, [], NO_DIRECTOR_SITES);
    expect(b.onSite).toBe(1);
    expect(b.awaitingSupervisor).toBe(1);
    expect(b.awaitingYou).toBe(1);
  });

  it('a SUBMITTED shift on a director-supervised site waits on you, not the supervisor', () => {
    const open = [shift('SUBMITTED', { site_id: 'd1' })];
    const b = bucketShifts(open, [], new Set(['d1']));
    expect(b.awaitingYou).toBe(1);
    expect(b.awaitingSupervisor).toBe(0);
  });

  it('approved-to-run and hours come from the run window, not the open backlog', () => {
    const windowShifts = [
      shift('PAYROLL_APPROVED', { total_hours: 8 }),
      shift('PAYROLL_APPROVED', { total_hours: 7.5 }),
      shift('SUBMITTED'),
    ];
    const b = bucketShifts([], windowShifts, NO_DIRECTOR_SITES);
    expect(b.approvedToRun).toBe(2);
    expect(b.approvedHours).toBe(15.5);
    expect(b.submittedInWindow).toBe(1);
  });
});

describe('derivePayrunSituation', () => {
  it('HELD when the chain is broken — never a run over a held record', () => {
    const s = derivePayrunSituation({ chainBroken: true, buckets: buckets({ approvedToRun: 3 }), ...HREFS });
    expect(s.state).toBe('HELD');
    expect(s.canRun).toBe(false);
    expect(s.primary?.href).toBe('#handled');
  });

  it('READY when chain green, nothing waiting, ≥1 approved — matches the server gate', () => {
    const s = derivePayrunSituation({
      chainBroken: false,
      buckets: buckets({ approvedToRun: 4, approvedHours: 31.5, submittedInWindow: 0 }),
      ...HREFS,
    });
    expect(s.state).toBe('READY');
    expect(s.canRun).toBe(true);
    expect(s.runLabel).toContain('4 shifts');
    expect(s.runLabel).toContain('31.5 hrs');
  });

  it('not READY while a shift in the window is still submitted (holds the whole period)', () => {
    const s = derivePayrunSituation({
      chainBroken: false,
      buckets: buckets({ approvedToRun: 2, submittedInWindow: 1, awaitingSupervisor: 1 }),
      ...HREFS,
    });
    expect(s.state).toBe('ALMOST');
    expect(s.canRun).toBe(false);
  });

  it('ALMOST points at your approvals when shifts wait on you', () => {
    const s = derivePayrunSituation({
      chainBroken: false,
      buckets: buckets({ awaitingYou: 2 }),
      ...HREFS,
    });
    expect(s.state).toBe('ALMOST');
    expect(s.headline).toContain('waiting on your approval');
    expect(s.primary?.href).toBe('#with-you');
  });

  it('ALMOST with no operator action says it is on its way, no dead button', () => {
    const s = derivePayrunSituation({
      chainBroken: false,
      buckets: buckets({ awaitingSupervisor: 2, onSite: 1 }),
      ...HREFS,
    });
    expect(s.state).toBe('ALMOST');
    expect(s.primary).toBeNull();
    expect(s.headline).toContain('on its way');
  });

  it('CAUGHT_UP when nothing is in flight — calm, with a link to the last run', () => {
    const s = derivePayrunSituation({
      chainBroken: false,
      buckets: buckets(),
      approvalsHref: '#with-you',
      heldHref: '#handled',
      lastRun: { label: 'Tue 16 Jun 2026', href: '/payruns/abc' },
    });
    expect(s.state).toBe('CAUGHT_UP');
    expect(s.headline).toContain('All caught up');
    expect(s.secondary?.href).toBe('/payruns/abc');
  });

  it('an aged decision in the backlog keeps it ALMOST, never falsely CAUGHT_UP', () => {
    // window empty (nothing approved/submitted this week) but an old
    // supervisor-approved shift sits in the open backlog.
    const s = derivePayrunSituation({
      chainBroken: false,
      buckets: buckets({ awaitingYou: 1 }),
      ...HREFS,
    });
    expect(s.state).toBe('ALMOST');
  });
});
