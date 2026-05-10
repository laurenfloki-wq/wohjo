// CRACK 193 — Stripe webhook idempotency tests.
//
// Source-string + mock-invocation tests verifying that
// /api/stripe/webhook correctly deduplicates replayed events.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Source file ─────────────────────────────────────────────────────────────

const ROUTE_SOURCE = readFileSync(
  join(process.cwd(), 'src/app/api/stripe/webhook/route.ts'),
  'utf-8',
);

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn() },
}));

const { verifyStripeSignatureMock } = vi.hoisted(() => ({
  verifyStripeSignatureMock: vi.fn(),
}));

const { lookupHandlerMock } = vi.hoisted(() => ({
  lookupHandlerMock: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => supabaseMock,
}));

vi.mock('@/lib/stripe/webhook-signature', () => ({
  verifyStripeSignature: verifyStripeSignatureMock,
}));

vi.mock('@/lib/stripe/webhook-handlers', () => ({
  lookupHandler: lookupHandlerMock,
}));

vi.mock('@/lib/logger', () => ({
  routeLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { POST } from '../../src/app/api/stripe/webhook/route';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TEST_EVENT = {
  id: 'evt_test_001',
  type: 'checkout.session.completed',
  livemode: false,
  created: 1715300000,
  object: 'event',
  data: { object: {} },
};

function makeRequest(body = TEST_EVENT) {
  return new Request('http://test/api/stripe/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': 't=123,v1=abc',
    },
    body: JSON.stringify(body),
  });
}

// Build a chainable mock for supabase.from()
function chainable(result: { data?: unknown; error?: unknown | null }) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'is', 'order', 'limit']) {
    c[m] = vi.fn(() => c);
  }
  c['single'] = vi.fn(() => Promise.resolve(result));
  c['maybeSingle'] = vi.fn(() => Promise.resolve(result));
  c['then'] = (res: (v: typeof result) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej);
  c['catch'] = (rej: (e: unknown) => unknown) => Promise.resolve(result).catch(rej);
  return c;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  verifyStripeSignatureMock.mockReturnValue({ ok: true });
});

// ─── Source-string substrate ─────────────────────────────────────────────────

describe('stripe/webhook — idempotency substrate (CRACK 193)', () => {
  it('inserts into stripe_event_log on receipt', () => {
    expect(ROUTE_SOURCE).toContain("from('stripe_event_log')");
    expect(ROUTE_SOURCE).toContain('event_id: event.id');
    expect(ROUTE_SOURCE).toContain('event_type: event.type');
  });

  it('detects duplicate via 23505 code check', () => {
    expect(ROUTE_SOURCE).toContain("'23505'");
    expect(ROUTE_SOURCE).toContain('duplicate key');
    expect(ROUTE_SOURCE).toContain('idempotent');
  });

  it('sets processed_at on successful handler dispatch', () => {
    expect(ROUTE_SOURCE).toContain('processed_at');
    expect(ROUTE_SOURCE).toContain('new Date().toISOString()');
  });

  it('payload_summary never stores full payload (privacy)', () => {
    // payload_summary should not pass `event` directly as value
    expect(ROUTE_SOURCE).not.toMatch(/payload_summary:\s*event[,\s\n]/);
  });
});

// ─── Signature guard ─────────────────────────────────────────────────────────

describe('stripe/webhook — signature guard', () => {
  it('returns 401 on bad signature', async () => {
    verifyStripeSignatureMock.mockReturnValue({ ok: false, reason: 'sig_mismatch' });
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 400 on malformed JSON', async () => {
    const req = new Request('http://test/api/stripe/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=x' },
      body: '{ bad json )',
    });
    // signature check runs first; make it pass so we hit the JSON parse
    verifyStripeSignatureMock.mockReturnValue({ ok: true });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// ─── First delivery ───────────────────────────────────────────────────────────

describe('stripe/webhook — first delivery', () => {
  it('inserts event_log row, dispatches handler, marks processed_at, returns 200', async () => {
    const updateChain = chainable({ data: null, error: null });
    const updateFn = vi.fn(() => updateChain);

    supabaseMock.from.mockImplementation((table: string) => {
      expect(table).toBe('stripe_event_log');
      const c = chainable({ data: null, error: null });
      (c as Record<string, unknown>)['update'] = updateFn;
      return c;
    });

    const handlerMock = vi.fn().mockResolvedValue({ ok: true, summary: 'handled' });
    lookupHandlerMock.mockReturnValue(handlerMock);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { received: boolean; handled: boolean };
    expect(json.received).toBe(true);
    expect(json.handled).toBe(true);
    expect(handlerMock).toHaveBeenCalledOnce();
    expect(updateFn).toHaveBeenCalledOnce();
  });
});

// ─── Duplicate replay ────────────────────────────────────────────────────────

describe('stripe/webhook — duplicate replay', () => {
  it('short-circuits with 200 on PK unique-violation without calling handler', async () => {
    supabaseMock.from.mockImplementation(() =>
      chainable({ data: null, error: { code: '23505', message: 'duplicate key value' } }),
    );

    const handlerMock = vi.fn();
    lookupHandlerMock.mockReturnValue(handlerMock);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { idempotent: boolean };
    expect(json.idempotent).toBe(true);
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it('also short-circuits when error message contains "duplicate key" (no code field)', async () => {
    supabaseMock.from.mockImplementation(() =>
      chainable({
        data: null,
        error: { message: 'ERROR: duplicate key value violates unique constraint' },
      }),
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { idempotent: boolean };
    expect(json.idempotent).toBe(true);
  });

  it('returns 500 on non-duplicate insert failure so Stripe retries', async () => {
    supabaseMock.from.mockImplementation(() =>
      chainable({ data: null, error: { code: '53300', message: 'too many connections' } }),
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
  });
});
