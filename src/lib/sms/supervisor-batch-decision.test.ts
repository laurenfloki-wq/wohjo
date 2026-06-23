import { describe, it, expect } from 'vitest';
import { decideBatchSend, DEFAULT_SEND_CONFIG } from './supervisor-batch-decision';

// 2026-06-18 is a Thursday. Sydney is UTC+10 (AEST, no DST in June).
// 06:00 UTC = 16:00 Sydney; 10:00 UTC = 20:00 Sydney; 22:00 UTC = 08:00 Sydney (Fri).
const at = (utc: string) => new Date(utc).getTime();

describe('decideBatchSend', () => {
  it('does not send when there is nothing pending', () => {
    const d = decideBatchSend({
      nowMs: at('2026-06-18T06:00:00Z'),
      pendingEndTimes: [],
      anyInProgress: false,
      lastSentAtIso: null,
    });
    expect(d).toEqual({ send: false, reason: 'no_pending' });
  });

  it('sends once the site day is done — last clock-out settled past the lag', () => {
    // last clock-out 13:00 Sydney (03:00 UTC); now 16:00 Sydney (06:00 UTC) → 3h later.
    const d = decideBatchSend({
      nowMs: at('2026-06-18T06:00:00Z'),
      pendingEndTimes: ['2026-06-18T03:00:00Z'],
      anyInProgress: false,
      lastSentAtIso: null,
    });
    expect(d).toEqual({ send: true, reason: 'site_day_done' });
  });

  it('waits while a worker at the site is still on the clock (early in the day)', () => {
    const d = decideBatchSend({
      nowMs: at('2026-06-18T04:00:00Z'), // 14:00 Sydney
      pendingEndTimes: ['2026-06-18T03:00:00Z'],
      anyInProgress: true,
      lastSentAtIso: null,
    });
    expect(d).toEqual({ send: false, reason: 'waiting_for_day_end' });
  });

  it('waits while the last clock-out is still within the lag window', () => {
    // last out 05:40 UTC, now 06:00 UTC → 20 min < 60 min lag; afternoon (16:00 Syd).
    const d = decideBatchSend({
      nowMs: at('2026-06-18T06:00:00Z'),
      pendingEndTimes: ['2026-06-18T05:40:00Z'],
      anyInProgress: false,
      lastSentAtIso: null,
    });
    expect(d).toEqual({ send: false, reason: 'waiting_for_day_end' });
  });

  it('evening floor sends even if a worker is still clocked in', () => {
    // 10:00 UTC = 20:00 Sydney ≥ 19 floor.
    const d = decideBatchSend({
      nowMs: at('2026-06-18T10:00:00Z'),
      pendingEndTimes: ['2026-06-18T08:00:00Z'],
      anyInProgress: true,
      lastSentAtIso: null,
    });
    expect(d).toEqual({ send: true, reason: 'evening_floor' });
  });

  it('only one send per Sydney day — skips if already sent today', () => {
    const d = decideBatchSend({
      nowMs: at('2026-06-18T10:00:00Z'),
      pendingEndTimes: ['2026-06-18T03:00:00Z'],
      anyInProgress: false,
      lastSentAtIso: '2026-06-18T06:00:00Z', // earlier same Sydney day
    });
    expect(d).toEqual({ send: false, reason: 'already_sent_today' });
  });

  it('a new day after yesterday’s send rolls the still-pending shift forward', () => {
    // last sent 2026-06-17 06:00 UTC; now 2026-06-18 22:00 UTC = Fri 08:00 Sydney.
    const d = decideBatchSend({
      nowMs: at('2026-06-18T22:00:00Z'),
      pendingEndTimes: ['2026-06-17T03:00:00Z'],
      anyInProgress: false,
      lastSentAtIso: '2026-06-17T06:00:00Z',
    });
    expect(d.send).toBe(true);
    expect(d.reason).toBe('site_day_done');
  });

  it('respects a custom lag/floor config', () => {
    const cfg = { lagMinutes: 30, eveningFloorHour: 17 };
    const d = decideBatchSend(
      {
        nowMs: at('2026-06-18T06:00:00Z'),
        pendingEndTimes: ['2026-06-18T05:20:00Z'], // 40 min ago ≥ 30 lag
        anyInProgress: false,
        lastSentAtIso: null,
      },
      cfg,
    );
    expect(d.send).toBe(true);
  });

  it('default config is 60 min lag / 19:00 floor', () => {
    expect(DEFAULT_SEND_CONFIG).toEqual({ lagMinutes: 60, eveningFloorHour: 19 });
  });
});
