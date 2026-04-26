import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Supabase server client before importing the subject.
vi.mock('@/lib/supabase/server', () => {
  const insertMock = vi.fn();
  const fromChain = {
    insert: insertMock,
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
  };
  const supabase = {
    from: vi.fn().mockReturnValue(fromChain),
  };
  return {
    createServiceClient: vi.fn().mockReturnValue(supabase),
    __mocks: { insertMock, fromChain, supabase },
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

import { checkAndRecordWebhookIdempotency } from './idempotency';
import * as supabaseModule from '@/lib/supabase/server';

type MocksBag = {
  insertMock: ReturnType<typeof vi.fn>;
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

  it('returns duplicate=true with firstSeenAt on unique-violation (SQLSTATE 23505)', async () => {
    mocks.insertMock.mockResolvedValueOnce({
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    mocks.fromChain.single.mockResolvedValueOnce({
      data: { first_seen_at: '2026-04-21T09:00:00Z' },
      error: null,
    });
    const r = await checkAndRecordWebhookIdempotency('twilio', 'SMdup', '/api/webhooks/twilio');
    expect(r.duplicate).toBe(true);
    expect(r.firstSeenAt).toBe('2026-04-21T09:00:00Z');
  });

  it('on unexpected DB error, opens the gate (duplicate=false) — belt-and-braces', async () => {
    mocks.insertMock.mockResolvedValueOnce({
      error: { code: '42P01', message: 'relation does not exist' },
    });
    const r = await checkAndRecordWebhookIdempotency('twilio', 'SMany', '/api/webhooks/twilio');
    expect(r.duplicate).toBe(false);
  });
});
