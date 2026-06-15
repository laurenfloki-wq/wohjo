// Ask cost rail — per-operator daily cap (2026-06-13).
//
// Mock-invocation tests for the cost guard fronting POST /api/page/ask.
// They assert the cap is consulted with a per-operator+Sydney-day key,
// that an over-cap operator gets 429 without any paid Anthropic call,
// and that the no-key (503) and empty-question (400) paths short-circuit
// BEFORE the limiter so neither consumes a question of the daily quota.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────
const { getCompanyIdForSessionMock } = vi.hoisted(() => ({
  getCompanyIdForSessionMock: vi.fn(),
}));
const { checkRateLimitDurableMock } = vi.hoisted(() => ({
  checkRateLimitDurableMock: vi.fn(),
}));
const { pageRepoMock } = vi.hoisted(() => ({
  pageRepoMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  getCompanyIdForSession: getCompanyIdForSessionMock,
}));
vi.mock('@/lib/security/rate-limit-durable', () => ({
  checkRateLimitDurable: checkRateLimitDurableMock,
}));
vi.mock('@/lib/db/repositories/page.repo', () => ({
  pageRepo: pageRepoMock,
}));
vi.mock('@/lib/logger', () => ({
  routeLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { POST } from '../../src/app/api/page/ask/route';

const COMPANY_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';

function makeRequest(body: Record<string, unknown> = { question: 'How many hours did Joao work?' }) {
  return new Request('http://test/api/page/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  getCompanyIdForSessionMock.mockResolvedValue({
    companyId: COMPANY_ID,
    userId: USER_ID,
    role: 'owner',
  });
  pageRepoMock.mockReturnValue({
    eventsSince: vi.fn().mockResolvedValue({ data: [] }),
    shiftsBetween: vi.fn().mockResolvedValue({ data: [] }),
    latestExport: vi.fn().mockResolvedValue({ data: null }),
    workerNames: vi.fn().mockResolvedValue({ data: [] }),
  });
  checkRateLimitDurableMock.mockResolvedValue({
    allowed: true,
    remaining: 39,
    resetAt: Date.now() + 86_400_000,
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe('page/ask — per-operator daily cost cap', () => {
  it('under the cap: consults the limiter with a per-operator+day key, calls Anthropic once', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Joao worked 8 hours. Refs: FSTR-0013' }],
      }),
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { answer: string; refs: string };
    expect(json.answer).toBe('Joao worked 8 hours.');
    expect(json.refs).toBe('FSTR-0013');

    expect(checkRateLimitDurableMock).toHaveBeenCalledTimes(1);
    expect(checkRateLimitDurableMock).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^ask:${COMPANY_ID}:${USER_ID}:\\d{4}-\\d{2}-\\d{2}$`)),
      expect.objectContaining({ maxRequests: 40, windowMs: 86_400_000 }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('at the cap: returns 429 daily_limit and never calls Anthropic', async () => {
    checkRateLimitDurableMock.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 3_600_000,
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
    const json = (await res.json()) as { error: string; resetAt: string };
    expect(json.error).toBe('daily_limit');
    expect(typeof json.resetAt).toBe('string');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no key wins over the limiter: 503 not_connected without consuming quota', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const res = await POST(makeRequest());
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('not_connected');
    expect(checkRateLimitDurableMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('empty question: 400 without consuming quota', async () => {
    const res = await POST(makeRequest({ question: '   ' }));
    expect(res.status).toBe(400);
    expect(checkRateLimitDurableMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
