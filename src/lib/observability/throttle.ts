// Observability shim — alert throttle.
//
// Why: a single broken endpoint can fire thousands of 500s per minute. Without
// throttling, the Slack channel gets unusable in seconds and Lauren misses the
// signal we built this for. We cap alerts per (route + status) per minute.
//
// Scope: in-memory only — each Vercel Function instance throttles
// independently. That is acceptable for the pre-Mo shim. The point is to keep
// the Slack channel readable, not to perfectly de-dupe across the fleet.

interface ThrottleEntry {
  count: number;
  windowStart: number;
}

export interface ThrottleOptions {
  windowMs: number;
  maxPerWindow: number;
}

const DEFAULT_OPTS: ThrottleOptions = {
  windowMs: 60_000,
  maxPerWindow: 10,
};

export class AlertThrottle {
  private readonly store = new Map<string, ThrottleEntry>();
  private readonly opts: ThrottleOptions;

  constructor(opts: Partial<ThrottleOptions> = {}, private readonly now = () => Date.now()) {
    this.opts = { ...DEFAULT_OPTS, ...opts };
  }

  // Returns true if the alert should fire, false if throttled.
  // Window is rolling: when the first alert of a window arrives, windowStart is
  // set to "now"; the window expires windowMs later, then the next arrival
  // starts a fresh window.
  shouldFire(key: string): boolean {
    const t = this.now();
    const entry = this.store.get(key);

    if (!entry || t - entry.windowStart >= this.opts.windowMs) {
      this.store.set(key, { count: 1, windowStart: t });
      return true;
    }

    if (entry.count >= this.opts.maxPerWindow) {
      return false;
    }

    entry.count += 1;
    return true;
  }

  // Test-only helper: number of buckets currently tracked.
  size(): number {
    return this.store.size;
  }

  // Test-only helper: drop all buckets.
  reset(): void {
    this.store.clear();
  }
}

// Module-level singleton — shared by all callers in a given function instance.
export const defaultThrottle = new AlertThrottle();

// Convenience: build the throttle key from the two coordinates that matter for
// alert frequency. A 500 on /api/worker/shifts/start is a different signal from
// a 502 on the same route.
export function throttleKey(route: string, status: number): string {
  return `${route}::${status}`;
}
