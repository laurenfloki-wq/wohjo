// End-to-end integration test for the observability shim.
//
// Goal: prove the brief — "deliberately throw 500 on a test endpoint, mock
// Slack webhook, assert payload structure + redaction applied." We exercise
// the actual `onRequestError` export from the project-root instrumentation
// file rather than calling reportError directly, so the wiring is covered.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defaultThrottle } from './throttle';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  defaultThrottle.reset();
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
  process.env.SLACK_ERROR_WEBHOOK_URL = 'https://hooks.slack.com/services/test';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('instrumentation.onRequestError', () => {
  it('reports /api/* errors to Slack with redacted payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);

    const { onRequestError } = await import('../../../instrumentation');

    // Simulate the Next runtime catching an error from /api/field/shift/start.
    // The error message intentionally embeds PII to verify the redactor.
    const err = Object.assign(
      new Error('insert failed for worker +61412345678 (lauren@example.com)'),
      { digest: 'NEXT_REDIRECT' },
    );

    await onRequestError!(
      err,
      {
        path: '/api/field/shift/start',
        method: 'POST',
        headers: { 'x-vercel-id': 'syd1::xyz' },
      },
      {
        routerKind: 'App Router',
        routePath: '/app/api/field/shift/start/route',
        routeType: 'route',
      } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    const json = JSON.stringify(body);

    // Structure assertions
    expect(body).toHaveProperty('text');
    expect(body).toHaveProperty('blocks');
    expect(Array.isArray(body.blocks)).toBe(true);

    // Payload includes the route, status, request id, environment fields
    expect(json).toContain('/api/field/shift/start');
    expect(json).toContain('500');
    expect(json).toContain('syd1::xyz');

    // Redaction applied
    expect(json).not.toContain('+61412345678');
    expect(json).not.toContain('lauren@example.com');
    expect(json).toContain('[PHONE]');
    expect(json).toContain('[EMAIL]');
  });

  it('does not fire for non-/api routes', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { onRequestError } = await import('../../../instrumentation');

    await onRequestError!(
      new Error('render error') as Error & { digest: string },
      { path: '/field/home', method: 'GET', headers: {} },
      {
        routerKind: 'App Router',
        routePath: '/app/field/home/page',
        routeType: 'render',
      } as never,
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
