// CRACK 211 — /api/csp-report tests
//
// What this verifies:
//   1. A well-formed CSP report POST returns 204 and is logged via the
//      shared pino logger with structured fields.
//   2. Reports larger than the 10 KB cap are rejected with 413 (whether the
//      caller declared an oversized Content-Length or smuggled a big body).
//   3. After 100 reports/min from one IP, further reports return 429.
//   4. Malformed JSON quietly returns 204 (no log noise on garbage input).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { loggerWarn } = vi.hoisted(() => ({ loggerWarn: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  logger: {
    warn: loggerWarn,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
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
  };
});

import { POST } from './route';

beforeEach(() => {
  loggerWarn.mockReset();
});

function makeReport(body: unknown, ip = '203.0.113.1', extraHeaders: Record<string, string> = {}): Request {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request('http://localhost/api/csp-report', {
    method: 'POST',
    headers: {
      'content-type': 'application/csp-report',
      'content-length': String(new Blob([raw]).size),
      'x-forwarded-for': ip,
      ...extraHeaders,
    },
    body: raw,
  });
}

describe('POST /api/csp-report — CRACK 211', () => {
  it('accepts a well-formed report, logs the violation as csp.violation, and returns 204', async () => {
    const report = {
      'csp-report': {
        'document-uri': 'https://flostruction.com/field',
        referrer: '',
        'violated-directive': "script-src 'self'",
        'effective-directive': 'script-src',
        'original-policy': "default-src 'self'; report-uri /api/csp-report",
        'blocked-uri': 'https://evil.example/inject.js',
        'source-file': 'https://flostruction.com/field',
        'line-number': 12,
        'column-number': 7,
        disposition: 'report',
      },
    };

    const res = await POST(makeReport(report, '203.0.113.10'));
    expect(res.status).toBe(204);

    expect(loggerWarn).toHaveBeenCalledTimes(1);
    const [obj, msg] = loggerWarn.mock.calls[0];
    expect(msg).toBe('csp.violation');
    expect(obj.event).toBe('csp_violation');
    expect(obj.blocked_uri).toBe('https://evil.example/inject.js');
    expect(obj.violated_directive).toBe("script-src 'self'");
    expect(obj.effective_directive).toBe('script-src');
    expect(obj.document_uri).toBe('https://flostruction.com/field');
  });

  it('also accepts the bare-object report shape (no csp-report wrapper)', async () => {
    const flat = {
      'document-uri': 'https://flostruction.com/',
      'violated-directive': 'img-src',
      'blocked-uri': 'data:image/png;base64,xxx',
    };
    const res = await POST(makeReport(flat, '203.0.113.11'));
    expect(res.status).toBe(204);
    expect(loggerWarn).toHaveBeenCalledTimes(1);
    expect(loggerWarn.mock.calls[0][0].blocked_uri).toBe('data:image/png;base64,xxx');
  });

  it('rejects oversized bodies (Content-Length > 10 KB) with 413', async () => {
    const big = 'x'.repeat(11_000);
    const req = new Request('http://localhost/api/csp-report', {
      method: 'POST',
      headers: {
        'content-type': 'application/csp-report',
        'content-length': String(big.length),
        'x-forwarded-for': '203.0.113.20',
      },
      body: big,
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(loggerWarn).not.toHaveBeenCalled();
  });

  it('rejects oversized bodies even if Content-Length is understated', async () => {
    const big = 'x'.repeat(11_000);
    const req = new Request('http://localhost/api/csp-report', {
      method: 'POST',
      headers: {
        'content-type': 'application/csp-report',
        'content-length': '50', // lying header
        'x-forwarded-for': '203.0.113.21',
      },
      body: big,
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(loggerWarn).not.toHaveBeenCalled();
  });

  it('quietly returns 204 on malformed JSON without logging', async () => {
    const res = await POST(makeReport('not json at all', '203.0.113.30'));
    expect(res.status).toBe(204);
    expect(loggerWarn).not.toHaveBeenCalled();
  });

  it('returns 429 once a single IP has posted 100 reports in the window', async () => {
    const ip = '203.0.113.99';
    const payload = { 'csp-report': { 'blocked-uri': 'https://x.example' } };
    for (let i = 0; i < 100; i++) {
      const ok = await POST(makeReport(payload, ip));
      expect(ok.status).toBe(204);
    }
    const limited = await POST(makeReport(payload, ip));
    expect(limited.status).toBe(429);
  });
});
