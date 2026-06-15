import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Supabase server client before importing the subject.
vi.mock('@/lib/supabase/server', () => {
  const insertMock = vi.fn();
  const updateMock = vi.fn();
  // CRACK 158 lazy cleanup: delete().lt().not() is fire-and-forget thenable.
  const deleteMock = vi.fn(() => {
    const node: Record<string, unknown> = {};
    node.lt = vi.fn(() => node);
    node.not = vi.fn(() => node);
    node.then = (res: (v: { error: null }) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve({ error: null }).then(res, rej);
    return node;
  });
  const fromChain = {
    insert: insertMock,
    update: updateMock,
    delete: deleteMock,
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
  };
  // W4: markWebhookProcessed awaits update().eq().eq() — the eq node
  // self-chains and is thenable.
  updateMock.mockImplementation(() => {
    const updEq: Record<string, unknown> = {};
    updEq.eq = vi.fn(() => updEq);
    updEq.then = (res: (v: { error: null }) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve({ error: null }).then(res, rej);
    return updEq;
  });
  const supabase = {
    from: vi.fn().mockReturnValue(fromChain),
  };
  return {
    createServiceClient: vi.fn().mockReturnValue(supabase),
    __mocks: { insertMock, updateMock, fromChain, supabase },
  };
});

// Silence logger in tests.
vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnValue({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  },
}));

import { checkAndRecordWebhookIdempotency, markWebhookProcessed } from './idempotency';
import * as supabaseModule from '@/lib/supabase/server';

type MocksBag = {
  insertMock: ReturnType<typeof vi.fn>;
  updateMock: ReturnType<typeof vi.fn>;
  fromChain: {
    insert: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
  };
  supabase: { from: ReturnType<typeof vi.fn> };
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocks = (supabaseModule as any).__mocks as MocksBag;

describe('checkAndRecordWebhookIdempotency', () => {
  beforeEach(() => {
    mocks.insertMock.mockReset();
    mocks.fromChain.select.mockReset().mockReturnThis();
    mocks.fromChain.eq.mockReset().mockReturnThis();
    mocks.fromChain.single.mockReset();
  });

  it('returns duplicate=false when no key is supplied (opens gate, logs warn)', async () => {
    const r = await checkAndRecordWebhookIdempotency('twilio', '', '/any');
    expect(r.duplicate).toBe(false);
    expect(r.firstSeenAt).toBeUndefined();
    expect(mocks.insertMock).not.toHaveBeenCalled();
  });

  it('returns duplicate=false on a fresh key (insert succeeds)', async () => {
    mocks.insertMock.mockResolvedValueOnce({ error: null });
    const r = await checkAndRecordWebhookIdempotency('twilio', 'SMabc', '/api/webhooks/twilio');
    expect(r.duplicate).toBe(false);
    expect(mocks.insertMock).toHaveBeenCalledTimes(1);
  });

  it('returns duplicate=true, processed=true when the prior delivery completed', async () => {
    mocks.insertMock.mockResolvedValueOnce({
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    mocks.fromChain.single.mockResolvedValueOnce({
      data: { first_seen_at: '2026-04-21T09:00:00Z', processed_at: '2026-04-21T09:00:01Z' },
      error: null,
    });
    const r = await checkAndRecordWebhookIdempotency('twilio', 'SMdup', '/api/webhooks/twilio');
    expect(r.duplicate).toBe(true);
    expect(r.firstSeenAt).toBe('2026-04-21T09:00:00Z');
    expect(r.processed).toBe(true);
  });

  it('W4: returns duplicate=true, processed=false when the prior delivery died mid-flight (caller must reprocess)', async () => {
    mocks.insertMock.mockResolvedValueOnce({
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    mocks.fromChain.single.mockResolvedValueOnce({
      data: { first_seen_at: '2026-04-21T09:00:00Z', processed_at: null },
      error: null,
    });
    const r = await checkAndRecordWebhookIdempotency('twilio', 'SMhalf', '/api/webhooks/twilio');
    expect(r.duplicate).toBe(true);
    expect(r.processed).toBe(false);
  });

  it('W4: records the delivery payload on first sight', async () => {
    mocks.insertMock.mockResolvedValueOnce({ error: null });
    await checkAndRecordWebhookIdempotency('twilio', 'SMpay', '/route', { Body: 'YES ALL' });
    const row = mocks.insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(row.payload).toEqual({ Body: 'YES ALL' });
  });

  it('on unexpected DB error, opens the gate (duplicate=false) — belt-and-braces', async () => {
    mocks.insertMock.mockResolvedValueOnce({
      error: { code: '42P01', message: 'relation does not exist' },
    });
    const r = await checkAndRecordWebhookIdempotency('twilio', 'SMany', '/api/webhooks/twilio');
    expect(r.duplicate).toBe(false);
  });
});

describe('markWebhookProcessed (W4)', () => {
  it('stamps processed_at + outcome via update', async () => {
    await markWebhookProcessed('twilio', 'SMdone', 'YES_ALL');
    expect(mocks.updateMock).toHaveBeenCalledTimes(1);
    const fields = mocks.updateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(fields.outcome).toBe('YES_ALL');
    expect(fields.processed_at).toBeDefined();
  });

  it('no-ops on an empty key', async () => {
    mocks.updateMock.mockClear();
    await markWebhookProcessed('twilio', '', 'YES_ALL');
    expect(mocks.updateMock).not.toHaveBeenCalled();
  });
});

