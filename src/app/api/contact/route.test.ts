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
  // Override dep so the route uses our fake Resend.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deps.makeResend = () => ({ emails: { send: resendSend } } as any);
  process.env.CONTACT_EMAIL_TO = 'contact@flosmosis.com';
  process.env.CONTACT_EMAIL_FROM = 'FLOSTRUCTION <noreply@flosmosis.com>';
});

function makeRequest(body: unknown, ip = '203.0.113.1'): Request {
  return new Request('http://localhost/api/contact', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/contact — Day 3 P2.1', () => {
  it('accepts a valid submission and dispatches via Resend', async () => {
    const res = await POST(makeRequest({
      name: 'Lauren de Mestre',
      company: 'FLOSMOSIS Test',
      role: 'Founder',
      email: 'lauren@example.test',
      phone: '+61400000000',
      workers_on_site: '20',
      payroll_system: 'Employment Hero',
      message: 'Hello',
    }, '203.0.113.10'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(true);
    expect(resendSend).toHaveBeenCalledTimes(1);
    const args = resendSend.mock.calls[0][0];
    expect(args.to).toBe('contact@flosmosis.com');
    expect(args.subject).toContain('FLOSMOSIS Test');
    expect(args.replyTo).toBe('lauren@example.test');
  });

  it('rejects an invalid payload with 400', async () => {
    const res = await POST(makeRequest({
      name: '',
      company: '',
      email: 'not-an-email',
    }, '203.0.113.20'));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/invalid payload/i);
    expect(resendSend).not.toHaveBeenCalled();
  });

  it('returns 429 after 5 submissions from the same IP within an hour', async () => {
    const ip = '203.0.113.30';
    const payload = { name: 'x', company: 'y', email: 'a@b.co' };
    for (let i = 0; i < 5; i++) {
      const ok = await POST(makeRequest(payload, ip));
      expect(ok.status).toBe(200);
    }
    const limited = await POST(makeRequest(payload, ip));
    expect(limited.status).toBe(429);
    const json = (await limited.json()) as { error: string };
    expect(json.error).toMatch(/rate limit/i);
  });
});
