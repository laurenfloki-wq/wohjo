import { describe, it, expect } from 'vitest';
import { isCronFresh, CRON_STALE_MS } from './cron-freshness';

const NOW = Date.parse('2026-06-22T12:00:00Z');

describe('isCronFresh (audit OBS-3 dead-man\'s-switch)', () => {
  it('fresh when the last run is within the window', () => {
    expect(isCronFresh('2026-06-22T00:00:00Z', NOW)).toBe(true); // 12h ago
  });

  it('stale when the last run is older than the window', () => {
    expect(isCronFresh('2026-06-20T00:00:00Z', NOW)).toBe(false); // ~60h ago
  });

  it('treats a null/absent last-run as NOT fresh (presumed dead)', () => {
    expect(isCronFresh(null, NOW)).toBe(false);
    expect(isCronFresh(undefined, NOW)).toBe(false);
  });

  it('treats an unparseable timestamp as NOT fresh', () => {
    expect(isCronFresh('not-a-date', NOW)).toBe(false);
  });

  it('respects the boundary (exactly 26h is stale)', () => {
    expect(isCronFresh(new Date(NOW - CRON_STALE_MS).toISOString(), NOW)).toBe(false);
    expect(isCronFresh(new Date(NOW - CRON_STALE_MS + 1000).toISOString(), NOW)).toBe(true);
  });
});
