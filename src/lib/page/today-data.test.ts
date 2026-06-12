import { describe, expect, it } from 'vitest';
import { CHAIN_BASELINE_EVENT_IDS } from '@/lib/wles/chain-baseline';
import {
  archiveDayCount,
  deriveChainState,
  deriveGreeting,
  deriveWeekReading,
  greetingWord,
  type AnchorRow,
  type HealthRow,
} from './today-data';

const anchorGreen: AnchorRow[] = [
  { id: 'FROZEN_ANCHOR_V0', matches: true, expected_count: 32, actual_count: 32 },
];

function health(partial: Partial<HealthRow> & { check_name: string; status: string }): HealthRow {
  return { run_at: '2026-06-11T17:00:34Z', detail: null, ...partial };
}

describe('deriveChainState', () => {
  it('reports verified clean when anchors match and the only mismatches are baselined', () => {
    const rows = [
      health({
        check_name: 'chain_integrity_shift_events',
        status: 'RED',
        detail: { events_scanned: 37, mismatch_count: CHAIN_BASELINE_EVENT_IDS.size },
      }),
      health({
        check_name: 'chain_integrity_shift_events_ex_baseline',
        status: 'GREEN',
        detail: { events_scanned: 37, mismatch_count: 0 },
      }),
    ];
    const s = deriveChainState(anchorGreen, rows);
    expect(s.broken).toBe(false);
    expect(s.extraMismatchCount).toBe(0);
    expect(s.chainText).toMatch(/^chain verified · \d+\/\d+$/);
    expect(s.expectedCount).toBe(37 - CHAIN_BASELINE_EVENT_IDS.size);
  });

  it('goes broken on an anchor mismatch', () => {
    const s = deriveChainState(
      [{ id: 'FROZEN_ANCHOR_V0', matches: false, expected_count: 32, actual_count: 31 }],
      [],
    );
    expect(s.broken).toBe(true);
    expect(s.chainText).toMatch(/^chain alert/);
  });

  it('goes broken when mismatches exceed the signed baseline', () => {
    const rows = [
      health({
        check_name: 'chain_integrity_shift_events',
        status: 'RED',
        detail: { events_scanned: 40, mismatch_count: CHAIN_BASELINE_EVENT_IDS.size + 2 },
      }),
    ];
    const s = deriveChainState(anchorGreen, rows);
    expect(s.broken).toBe(true);
    expect(s.extraMismatchCount).toBe(2);
  });

  it('never renders a negative or fabricated count', () => {
    const s = deriveChainState(anchorGreen, []);
    expect(s.cleanCount).toBeGreaterThanOrEqual(0);
    expect(s.expectedCount).toBeGreaterThanOrEqual(0);
  });
});

describe('deriveWeekReading', () => {
  const shift = (status: string, hours: number | null) => ({
    id: 'x',
    status,
    total_hours: hours,
    shift_date: '2026-06-10',
    receipt_id: null,
    worker_id: null,
    site_id: null,
    start_time: null,
  });

  it('sums verified hours and computes the weekly delta', () => {
    const week = [shift('EXPORTED', 8), shift('SUBMITTED', 7.5), shift('IN_PROGRESS', null)];
    const prev = [shift('EXPORTED', 10)];
    const r = deriveWeekReading(week, prev);
    expect(r.verifiedHours).toBe(15.5);
    expect(r.deltaPct).toBe(55);
    expect(r.sealedCount).toBe(1);
    expect(r.inMotionCount).toBe(1);
    expect(r.waitingCount).toBe(1);
  });

  it('reports null delta when last week has no hours — no fabricated numbers', () => {
    expect(deriveWeekReading([shift('EXPORTED', 8)], []).deltaPct).toBeNull();
  });
});

describe('greeting', () => {
  const week = {
    verifiedHours: 412.5,
    deltaPct: 6.2,
    sealedCount: 96,
    inMotionCount: 3,
    waitingCount: 2,
  };
  const chainOk = {
    broken: false,
    cleanCount: 25,
    expectedCount: 25,
    extraMismatchCount: 0,
    chainText: 'chain verified · 25/25',
    sweepAt: null,
  };

  it('states distance-to-safe', () => {
    const g = deriveGreeting({ now: new Date('2026-06-12T08:00:00+10:00'), chain: chainOk, waitingCount: 2, week });
    expect(g.before).toContain('2 decisions from');
    expect(g.emphasis).toBe('safe');
    expect(g.emphasisTone).toBe('safe');
    expect(g.sub).toContain('412.5');
  });

  it('declares safe to run when nothing is waiting', () => {
    const g = deriveGreeting({ now: new Date('2026-06-12T08:00:00+10:00'), chain: chainOk, waitingCount: 0, week });
    expect(g.emphasis).toBe('safe to run');
  });

  it('turns calm red on a broken chain and scopes the failure', () => {
    const g = deriveGreeting({
      now: new Date('2026-06-12T08:00:00+10:00'),
      chain: { ...chainOk, broken: true, extraMismatchCount: 1, cleanCount: 24, expectedCount: 25 },
      waitingCount: 2,
      week,
    });
    expect(g.emphasisTone).toBe('alarm');
    expect(g.emphasis).toBe('One record failed verification');
    expect(g.sub).toContain('24 of 25');
    expect(g.before + g.emphasis + g.after).not.toMatch(/!/);
  });

  it('is time-aware in Sydney', () => {
    expect(greetingWord(new Date('2026-06-12T08:00:00+10:00'))).toBe('Good morning');
    expect(greetingWord(new Date('2026-06-12T14:00:00+10:00'))).toBe('Good afternoon');
    expect(greetingWord(new Date('2026-06-12T19:00:00+10:00'))).toBe('Good evening');
  });
});

describe('archive', () => {
  it('counts distinct Sydney days', () => {
    expect(
      archiveDayCount([
        '2026-06-10T20:00:00Z', // 11 Jun Sydney
        '2026-06-11T01:00:00Z', // 11 Jun Sydney
        '2026-06-11T20:00:00Z', // 12 Jun Sydney
      ]),
    ).toBe(2);
  });
});
