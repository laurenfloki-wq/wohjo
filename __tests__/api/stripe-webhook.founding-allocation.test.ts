// B2 (2026-06-12) — founding-spot allocation idempotency.
//
// The checkout.session.completed handler decrements
// founding_config.spots_remaining BEFORE provisioning. If provisioning
// fails after the decrement, the route's stale-retry path re-dispatches
// the handler — which must NOT decrement again. The allocation is keyed
// to the event: the spot is persisted into the event's own
// stripe_event_log.payload_summary right after the decrement and reused
// on re-dispatch.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/api/stripe/checkout/route', () => ({
  verifyClientReference: vi.fn(() => ({
    uid: '00000000-0000-4000-8000-000000000001',
    meta: {
      email: 'demo@flosmosis.com',
      company_name: 'Demo Construction Co',
      abn_digits: '12345678901',
    },
  })),
}));

vi.mock('@/lib/email/welcome', () => ({
  sendWelcomeEmail: vi.fn(async () => undefined),
}));

import { STRIPE_HANDLERS } from '../../src/lib/stripe/webhook-handlers';

const handler = STRIPE_HANDLERS['checkout.session.completed'];

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;

function makeEvent() {
  return {
    id: 'evt_b2_founding_001',
    type: 'checkout.session.completed',
    livemode: false,
    created: 1781240000,
    data: {
      object: {
        id: 'cs_test_b2_001',
        customer: 'cus_b2_001',
        subscription: 'sub_b2_001',
        client_reference_id: 'signed-token',
        metadata: { pricing_tier: 'founding' },
      },
    },
  };
}

interface MockOpts {
  spotsRemaining?: string;
  priorSpot?: number | null;
}

interface CallCounts {
  eventLogReads: number;
  configReads: number;
  configUpdates: number;
  markerWrites: number;
  rpcCalls: number;
}

function makeSupabase(opts: MockOpts): { supabase: never; calls: CallCounts } {
  const calls: CallCounts = {
    eventLogReads: 0,
    configReads: 0,
    configUpdates: 0,
    markerWrites: 0,
    rpcCalls: 0,
  };

  const supabase = {
    from: vi.fn((table: string) => {
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit']) {
        c[m] = vi.fn(() => c);
      }
      c['single'] = vi.fn(() => {
        if (table === 'founding_config') {
          calls.configReads++;
          return Promise.resolve({ data: { value: opts.spotsRemaining ?? '5' }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });
      c['maybeSingle'] = vi.fn(() => {
        if (table === 'stripe_event_log') {
          calls.eventLogReads++;
          return Promise.resolve({
            data: {
              payload_summary:
                opts.priorSpot != null
                  ? { livemode: false, created: 1781240000, founding_spot: opts.priorSpot }
                  : { livemode: false, created: 1781240000 },
            },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      });
      c['update'] = vi.fn(() => {
        if (table === 'founding_config') calls.configUpdates++;
        if (table === 'stripe_event_log') calls.markerWrites++;
        return c;
      });
      // Awaited chain terminator: founding_config update→eq→eq→select
      // resolves matched rows; other updates resolve a plain ok.
      c['then'] = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({ data: [{ key: 'spots_remaining' }], error: null }).then(res, rej);
      return c;
    }),
    rpc: vi.fn(async () => {
      calls.rpcCalls++;
      return { data: 'b2c0ffee-0000-4000-8000-000000000001', error: null };
    }),
  };

  return { supabase: supabase as never, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('checkout.session.completed — founding allocation is event-keyed (B2)', () => {
  it('fresh event: decrements once and persists the spot onto the event row', async () => {
    const { supabase, calls } = makeSupabase({ spotsRemaining: '5', priorSpot: null });

    const result = await handler(makeEvent() as never, { log, supabase });

    expect(result.ok).toBe(true);
    expect(calls.configReads).toBe(1);
    expect(calls.configUpdates).toBe(1);
    expect(calls.markerWrites).toBe(1);
    expect(calls.rpcCalls).toBe(1);
    // 5 remaining → newRemaining 4 → position 20 - 4 = 16
    expect(result.summary).toContain('foundingSpot=16');
  });

  it('re-dispatch with marker present: reuses the spot, never touches founding_config', async () => {
    const { supabase, calls } = makeSupabase({ priorSpot: 16 });

    const result = await handler(makeEvent() as never, { log, supabase });

    expect(result.ok).toBe(true);
    expect(calls.configReads).toBe(0);
    expect(calls.configUpdates).toBe(0);
    expect(calls.markerWrites).toBe(0);
    expect(calls.rpcCalls).toBe(1);
    expect(result.summary).toContain('foundingSpot=16');
  });

  it('cohort full: returns REFUND_REQUIRED without decrementing or marking', async () => {
    const { supabase, calls } = makeSupabase({ spotsRemaining: '0', priorSpot: null });

    const result = await handler(makeEvent() as never, { log, supabase });

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('REFUND_REQUIRED');
    expect(calls.configUpdates).toBe(0);
    expect(calls.markerWrites).toBe(0);
    expect(calls.rpcCalls).toBe(0);
  });
});
