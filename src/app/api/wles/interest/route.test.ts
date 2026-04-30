// POST /api/wles/interest — F6 email capture endpoint test.
//
// Pattern mirrors src/app/api/contact/route.test.ts:
//   - mock @/lib/logger to silence routeLogger
//   - mock @/lib/security/rate-limit to count per-IP submissions
//   - replace deps.makeResend with a fake to capture send args
//
// Coverage: valid implementer submission, valid verifier submission,
// invalid payload (bad email), invalid payload (missing interest),
// rate limit enforcement after 5 submissions per IP per hour.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  routeLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  }),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/security/rate-limit', () => {
  const counts: Record<string, number> = {};
  return {
    checkRateLimit: (key: string, opts: { maxRequests: number; windowMs: number }) => {
      counts[key] = (counts[key] ?? 0) + 1;
      return {
        allowed: counts[key] <= opts.maxRequests,
        remaining: Math.max(0, opts.maxRequests - counts[key]),
        resetAt: Date.now() + opts.windowMs,
      };
    },
    getClientIP: (req: Request) => req.headers.get('x-forwarded-for') ?? '0.0.0.0',
    RATE_LIMITS: { WEBHOOK: { maxRequests: 100, windowMs: 60_000 } },
  };
});

import { POST, deps } from './route';

const resendSend = vi.fn().mockResolvedValue({ data: { id: 're-test' }, error: null });

beforeEach(() => {
  resendSend.mockReset().mockResolvedValue({ data: { id: 're-test' }, error: null });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deps.makeResend = () => ({ emails: { send: resendSend } } as any);
  process.env.STANDARDS_EMAIL_TO = 'standards@flosmosis.com';
  process.env.STANDARDS_EMAIL_FROM = 'WLES Foundation <noreply@flosmosis.com>';
});

function makeRequest(body: unknown, ip = '203.0.113.1'): Request {
  return new Request('http://localhost/api/wles/interest', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/wles/interest — WLES Commit 3 F6 email capture', () => {
  it('accepts an implementer submission and dispatches via Resend', async () => {
    const res = await POST(makeRequest({
      email: 'alex@example.test',
      interest: 'implementer',
      organisation: 'Example Pty Ltd',
      note: 'Evaluating WLES for an internal time-sheets tool.',
    }, '203.0.113.10'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(true);
    expect(resendSend).toHaveBeenCalledTimes(1);
    const args = resendSend.mock.calls[0][0];
    expect(args.to).toBe('standards@flosmosis.com');
    expect(args.subject).toContain('Implementer');
    expect(args.subject).toContain('alex@example.test');
    expect(args.replyTo).toBe('alex@example.test');
    expect(args.text).toMatch(/Captured via \/wles\/implementers/);
    expect(args.text).toMatch(/Constitution v1\.0 cl 7\.3/);
  });

  it('accepts a verifier submission and labels the subject correctly', async () => {
    const res = await POST(makeRequest({
      email: 'audit@firm.test',
      interest: 'verifier',
    }, '203.0.113.11'));
    expect(res.status).toBe(200);
    const args = resendSend.mock.calls[0][0];
    expect(args.subject).toContain('Independent verifier');
    expect(args.text).toMatch(/Captured via \/wles\/verifier/);
  });

  it('rejects an invalid email with 400', async () => {
    const res = await POST(makeRequest({
      email: 'not-an-email',
      interest: 'implementer',
    }, '203.0.113.12'));
    expect(res.status).toBe(400);
  });

  it('rejects a missing interest field with 400', async () => {
    const res = await POST(makeRequest({
      email: 'alex@example.test',
    }, '203.0.113.13'));
    expect(res.status).toBe(400);
  });

  it('rejects an invalid interest value with 400', async () => {
    const res = await POST(makeRequest({
      email: 'alex@example.test',
      interest: 'sponsor',
    }, '203.0.113.14'));
    expect(res.status).toBe(400);
  });

  it('rate-limits after 5 submissions per IP per hour', async () => {
    const ip = '203.0.113.99';
    for (let i = 0; i < 5; i++) {
      const ok = await POST(makeRequest({
        email: `t${i}@example.test`,
        interest: 'implementer',
      }, ip));
      expect(ok.status).toBe(200);
    }
    const limited = await POST(makeRequest({
      email: 't6@example.test',
      interest: 'implementer',
    }, ip));
    expect(limited.status).toBe(429);
  });

  it('returns 502 when Resend send fails', async () => {
    resendSend.mockRejectedValueOnce(new Error('resend down'));
    const res = await POST(makeRequest({
      email: 'alex@example.test',
      interest: 'implementer',
    }, '203.0.113.20'));
    expect(res.status).toBe(502);
  });

  it('returns 400 when the JSON body is malformed', async () => {
    const req = new Request('http://localhost/api/wles/interest', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.30' },
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
