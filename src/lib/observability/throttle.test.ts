// Observability shim — throttle unit tests.

import { describe, it, expect } from 'vitest';
import { AlertThrottle, throttleKey } from './throttle';

describe('AlertThrottle', () => {
  it('allows the first alert through', () => {
    const t = new AlertThrottle();
    expect(t.shouldFire('k')).toBe(true);
  });

  it('allows up to maxPerWindow alerts within the window', () => {
    const t = new AlertThrottle({ maxPerWindow: 10, windowMs: 60_000 });
    for (let i = 0; i < 10; i++) {
      expect(t.shouldFire('k')).toBe(true);
    }
  });

  it('drops the 11th alert in the same minute (default config)', () => {
    const t = new AlertThrottle();
    for (let i = 0; i < 10; i++) t.shouldFire('k');
    expect(t.shouldFire('k')).toBe(false);
  });

  it('resets the window after windowMs elapses', () => {
    let now = 0;
    const t = new AlertThrottle({ maxPerWindow: 2, windowMs: 1000 }, () => now);
    expect(t.shouldFire('k')).toBe(true); // 1
    expect(t.shouldFire('k')).toBe(true); // 2
    expect(t.shouldFire('k')).toBe(false); // throttled
    now += 1001;
    expect(t.shouldFire('k')).toBe(true); // window reset
  });

  it('tracks separate buckets per key', () => {
    const t = new AlertThrottle({ maxPerWindow: 1, windowMs: 60_000 });
    expect(t.shouldFire('a')).toBe(true);
    expect(t.shouldFire('b')).toBe(true);
    expect(t.shouldFire('a')).toBe(false);
    expect(t.shouldFire('b')).toBe(false);
  });

  it('treats route+status combos as independent buckets', () => {
    const t = new AlertThrottle({ maxPerWindow: 1, windowMs: 60_000 });
    const k500 = throttleKey('/api/field/shift/start', 500);
    const k502 = throttleKey('/api/field/shift/start', 502);
    expect(t.shouldFire(k500)).toBe(true);
    expect(t.shouldFire(k502)).toBe(true);
    expect(t.shouldFire(k500)).toBe(false);
  });
});

describe('throttleKey', () => {
  it('joins route and status into a deterministic key', () => {
    expect(throttleKey('/api/x', 500)).toBe('/api/x::500');
  });
});
