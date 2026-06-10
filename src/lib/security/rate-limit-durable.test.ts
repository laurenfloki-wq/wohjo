// Flostruction — Durable Rate Limiter Tests (finding B-ii)
//
// The key property: exceeding maxRequests ACROSS separate limiter
// instances that share one DB returns allowed: false — i.e. the limit
// is global, not per-warm-instance. We simulate separate serverless
// instances with vi.resetModules() (fresh in-memory L1 per instance)
// against a single shared fake Postgres bucket store.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Shared fake DB: emulates the check_rate_limit() atomic upsert.
const db = new Map<string, { count: number; resetAt: number }>();

function fakeCheckRateLimitRpc(p_key: string, p_window_ms: number, p_max: number) {
  const now = Date.now();
  const existing = db.get(p_key);
  let count: number;
  let resetAt: number;
  if (!existing || existing.resetAt < now) {
    count = 1;
    resetAt = now + p_window_ms;
    db.set(p_key, { count, resetAt: resetAt });
  } else {
    existing.count += 1;
    count = existing.count;
    resetAt = existing.resetAt;
  }
  return {
    allowed: count <= p_max,
    remaining: Math.max(p_max - count, 0),
    reset_at: new Date(resetAt).toISOString(),
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn !== 'check_rate_limit') return { data: null, error: { message: 'unknown fn' } };
      return {
        data: [
          fakeCheckRateLimitRpc(
            args.p_key as string,
            args.p_window_ms as number,
            args.p_max as number,
          ),
        ],
        error: null,
      };
    },
  }),
}));

async function freshInstance() {
  // New module registry = new in-memory L1 store = "new serverless instance".
  vi.resetModules();
  return await import('./rate-limit-durable');
}

describe('checkRateLimitDurable', () => {
  beforeEach(() => {
    db.clear();
  });

  it('allows requests under the limit on a single instance', async () => {
    const { checkRateLimitDurable } = await freshInstance();
    const opts = { windowMs: 60_000, maxRequests: 3 };
    const r1 = await checkRateLimitDurable('k1', opts);
    const r2 = await checkRateLimitDurable('k1', opts);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);
  });

  it('denies once the limit is exceeded on a single instance', async () => {
    const { checkRateLimitDurable } = await freshInstance();
    const opts = { windowMs: 60_000, maxRequests: 2 };
    await checkRateLimitDurable('k2', opts);
    await checkRateLimitDurable('k2', opts);
    const r3 = await checkRateLimitDurable('k2', opts);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it('exceeding maxRequests ACROSS separate instances sharing one DB returns allowed: false', async () => {
    const opts = { windowMs: 60_000, maxRequests: 5 };

    // Instance A: 3 requests (under its own L1 limit and the global one).
    const a = await freshInstance();
    for (let i = 0; i < 3; i++) {
      const r = await a.checkRateLimitDurable('shared-key', opts);
      expect(r.allowed).toBe(true);
    }

    // Instance B: fresh L1 (cold start). Its local count starts at zero,
    // so an in-memory-only limiter would allow 5 more. The shared DB
    // must deny from the 3rd request here (global total 6 > 5).
    const b = await freshInstance();
    const r4 = await b.checkRateLimitDurable('shared-key', opts); // global 4
    const r5 = await b.checkRateLimitDurable('shared-key', opts); // global 5
    const r6 = await b.checkRateLimitDurable('shared-key', opts); // global 6 -> deny
    expect(r4.allowed).toBe(true);
    expect(r5.allowed).toBe(true);
    expect(r6.allowed).toBe(false);
  });

  it('an L1 deny short-circuits without consulting the DB', async () => {
    const { checkRateLimitDurable } = await freshInstance();
    const opts = { windowMs: 60_000, maxRequests: 1 };
    await checkRateLimitDurable('k3', opts); // L1 count 1, DB count 1
    const dbCallsBefore = db.get('k3')?.count;
    const r2 = await checkRateLimitDurable('k3', opts); // L1 denies
    expect(r2.allowed).toBe(false);
    expect(db.get('k3')?.count).toBe(dbCallsBefore); // DB untouched
  });

  it('window expiry resets the global bucket', async () => {
    vi.useFakeTimers();
    try {
      const { checkRateLimitDurable } = await freshInstance();
      const opts = { windowMs: 100, maxRequests: 1 };
      const r1 = await checkRateLimitDurable('k4', opts);
      expect(r1.allowed).toBe(true);
      const r2 = await checkRateLimitDurable('k4', opts);
      expect(r2.allowed).toBe(false);
      vi.advanceTimersByTime(150);
      const r3 = await checkRateLimitDurable('k4', opts);
      expect(r3.allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('MFA endpoints durability (finding 0.1 — per-workerId keys, inline windows)', () => {
  beforeEach(() => {
    db.clear();
  });

  it('mfa-issue (5/hour/worker) holds across separate instances sharing one DB', async () => {
    const opts = { windowMs: 60 * 60 * 1000, maxRequests: 5 }; // mirrors worker/mfa/issue
    const key = 'mfa-issue:worker-uuid-1';

    const a = await freshInstance();
    for (let i = 0; i < 3; i++) {
      expect((await a.checkRateLimitDurable(key, opts)).allowed).toBe(true); // global 1..3
    }

    // Cold start: fresh L1. In-memory-only would allow 5 more; the shared
    // DB must deny from the 3rd request here (global total 6 > 5).
    const b = await freshInstance();
    expect((await b.checkRateLimitDurable(key, opts)).allowed).toBe(true);  // global 4
    expect((await b.checkRateLimitDurable(key, opts)).allowed).toBe(true);  // global 5
    expect((await b.checkRateLimitDurable(key, opts)).allowed).toBe(false); // global 6
  });

  it('mfa-challenge (3/10min/worker) holds across separate instances sharing one DB', async () => {
    const opts = { windowMs: 10 * 60 * 1000, maxRequests: 3 }; // mirrors worker/mfa/challenge
    const key = 'mfa-challenge:worker-uuid-1';

    const a = await freshInstance();
    expect((await a.checkRateLimitDurable(key, opts)).allowed).toBe(true); // global 1
    expect((await a.checkRateLimitDurable(key, opts)).allowed).toBe(true); // global 2

    const b = await freshInstance();
    expect((await b.checkRateLimitDurable(key, opts)).allowed).toBe(true);  // global 3
    expect((await b.checkRateLimitDurable(key, opts)).allowed).toBe(false); // global 4
  });

  it('different workers do not share an MFA bucket', async () => {
    const opts = { windowMs: 10 * 60 * 1000, maxRequests: 3 };
    const a = await freshInstance();
    for (let i = 0; i < 3; i++) {
      expect((await a.checkRateLimitDurable('mfa-challenge:worker-A', opts)).allowed).toBe(true);
    }
    expect((await a.checkRateLimitDurable('mfa-challenge:worker-A', opts)).allowed).toBe(false);
    expect((await a.checkRateLimitDurable('mfa-challenge:worker-B', opts)).allowed).toBe(true);
  });
});

describe('checkRateLimitDurable failure mode', () => {
  it('fails open to the L1 result when the DB call throws', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase/server', () => ({
      createServiceClient: () => ({
        rpc: async () => {
          throw new Error('db down');
        },
      }),
    }));
    const { checkRateLimitDurable } = await import('./rate-limit-durable');
    const opts = { windowMs: 60_000, maxRequests: 2 };
    const r1 = await checkRateLimitDurable('k5', opts);
    const r2 = await checkRateLimitDurable('k5', opts);
    const r3 = await checkRateLimitDurable('k5', opts); // L1 denies locally
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(false);
    vi.doUnmock('@/lib/supabase/server');
  });
});
