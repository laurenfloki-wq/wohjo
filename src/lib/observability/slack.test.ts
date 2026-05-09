// Observability shim — Slack notifier tests.
//
// Covers the integration brief from the workstream:
//   - deliberately throw a 500-shaped error
//   - mock fetch (the Slack webhook)
//   - assert the payload is structured + redacted + scoped to /api/*
//   - assert graceful no-op when env var missing
//   - assert /api/* scope guard rejects non-API paths

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  reportError,
  buildPayload,
  isApiRoute,
  formatAest,
  __test,
} from './slack';
import { defaultThrottle } from './throttle';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  // Fresh state per test.
  defaultThrottle.reset();
  __test.resetStartupLog();
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('isApiRoute', () => {
  it('matches /api/* paths', () => {
    expect(isApiRoute('/api/field/shift/start')).toBe(true);
    expect(isApiRoute('/api/anything')).toBe(true);
  });

  it('strips query string before matching', () => {
    expect(isApiRoute('/api/x?foo=1')).toBe(true);
  });

  it('rejects non-API paths', () => {
    expect(isApiRoute('/_next/static/chunk.js')).toBe(false);
    expect(isApiRoute('/favicon.ico')).toBe(false);
    expect(isApiRoute('/field/home')).toBe(false);
    expect(isApiRoute('/')).toBe(false);
  });

  it('rejects empty / null', () => {
    expect(isApiRoute(null)).toBe(false);
    expect(isApiRoute(undefined)).toBe(false);
    expect(isApiRoute('')).toBe(false);
  });
});

describe('formatAest', () => {
  it('produces an AEST string with ISO source appended', () => {
    const out = formatAest(new Date('2026-05-09T17:00:00Z'));
    // Australia/Sydney is UTC+10 in May (no DST after April).
    expect(out).toContain('AEST');
    expect(out).toContain('2026-05-09T17:00:00.000Z');
  });
});

describe('buildPayload', () => {
  it('redacts PII from error.message', () => {
    const err = new Error('worker +61412345678 (lauren@example.com) failed');
    const payload = buildPayload({
      routePath: '/api/field/shift/start',
      status: 500,
      err,
      headers: new Headers(),
    });
    const json = JSON.stringify(payload);
    expect(json).not.toContain('+61412345678');
    expect(json).not.toContain('lauren@example.com');
    expect(json).toContain('[PHONE]');
    expect(json).toContain('[EMAIL]');
  });

  it('captures route, status, env, deployment, request id', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.VERCEL_URL = 'wohjo.vercel.app';
    const err = new Error('boom');
    const headers = new Headers({ 'x-vercel-id': 'iad1::abc123' });
    const payload = buildPayload({
      routePath: '/api/worker/shifts/start',
      status: 500,
      err,
      headers,
    });
    const json = JSON.stringify(payload);
    expect(json).toContain('/api/worker/shifts/start');
    expect(json).toContain('500');
    expect(json).toContain('production');
    expect(json).toContain('wohjo.vercel.app');
    expect(json).toContain('iad1::abc123');
  });

  it('truncates the top stack frame', () => {
    const err = new Error('boom');
    err.stack =
      'Error: boom\n' +
      '    at ' + 'x'.repeat(1000) + '\n' +
      '    at next-frame';
    const payload = buildPayload({
      routePath: '/api/x',
      status: 500,
      err,
      headers: new Headers(),
    });
    const json = JSON.stringify(payload);
    // Truncated frame should end with the ellipsis and not contain the full
    // 1000-char line nor the second frame (we keep the top frame only).
    expect(json).toContain('…');
    expect(json).not.toContain('next-frame');
  });
});

describe('reportError', () => {
  it('no-ops when SLACK_ERROR_WEBHOOK_URL is missing', async () => {
    delete process.env.SLACK_ERROR_WEBHOOK_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});

    await reportError({
      routePath: '/api/x',
      status: 500,
      err: new Error('boom'),
      headers: new Headers(),
    });

    expect(fetchMock).not.toHaveBeenCalled();
    // First call also logs the disabled notice (one-shot).
    expect(consoleErr).toHaveBeenCalledWith(
      expect.stringContaining('shim disabled'),
    );
  });

  it('no-ops on non-API routes even when configured', async () => {
    process.env.SLACK_ERROR_WEBHOOK_URL = 'https://hooks.slack.com/test';
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);

    await reportError({
      routePath: '/_next/static/chunk.js',
      status: 500,
      err: new Error('boom'),
      headers: new Headers(),
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs a redacted payload to the webhook on /api/* errors', async () => {
    process.env.SLACK_ERROR_WEBHOOK_URL = 'https://hooks.slack.com/test';
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);

    await reportError({
      routePath: '/api/field/shift/start',
      status: 500,
      err: new Error('worker +61412345678 missing'),
      headers: new Headers({ 'x-vercel-id': 'syd1::1' }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://hooks.slack.com/test');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(JSON.stringify(body)).not.toContain('+61412345678');
    expect(JSON.stringify(body)).toContain('[PHONE]');
    expect(JSON.stringify(body)).toContain('/api/field/shift/start');
    expect(JSON.stringify(body)).toContain('syd1::1');
  });

  it('throttles repeated alerts on the same route+status', async () => {
    process.env.SLACK_ERROR_WEBHOOK_URL = 'https://hooks.slack.com/test';
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);

    for (let i = 0; i < 12; i++) {
      await reportError({
        routePath: '/api/burst',
        status: 500,
        err: new Error('boom'),
        headers: new Headers(),
      });
    }

    // Default throttle: 10 per minute.
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it('swallows fetch failures silently (graceful degrade)', async () => {
    process.env.SLACK_ERROR_WEBHOOK_URL = 'https://hooks.slack.com/test';
    const fetchMock = vi.fn().mockRejectedValue(new Error('slack down'));
    vi.stubGlobal('fetch', fetchMock);
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      reportError({
        routePath: '/api/x',
        status: 500,
        err: new Error('boom'),
        headers: new Headers(),
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalled();
    expect(consoleErr).toHaveBeenCalledWith(
      expect.stringContaining('slack post failed'),
      expect.any(String),
    );
  });

  it('does not include request bodies, GPS, or auth tokens in payload', async () => {
    process.env.SLACK_ERROR_WEBHOOK_URL = 'https://hooks.slack.com/test';
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);

    // Pretend the route handler somehow leaked sensitive context into the
    // error message (this is the worst case the redactor must defend against).
    const err = new Error(
      'failed to insert {"phone":"+61400000001","email":"x@y.com","shiftId":"35b06f94-32dd-81f5-a7ac-d837940779c2"}',
    );
    await reportError({
      routePath: '/api/field/shift/start',
      status: 500,
      err,
      headers: new Headers({ authorization: 'Bearer secret-token' }),
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const json = JSON.stringify(body);
    expect(json).not.toContain('+61400000001');
    expect(json).not.toContain('x@y.com');
    expect(json).not.toContain('35b06f94-32dd-81f5-a7ac-d837940779c2');
    expect(json).not.toContain('Bearer secret-token');
    expect(json).not.toContain('secret-token');
  });
});
