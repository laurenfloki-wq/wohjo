// CRACK 211 — CSP header tests (via proxy.ts)
//
// What this verifies:
//   1. Every response carries the Content-Security-Policy-Report-Only header.
//   2. The header is the spec policy (directive set, hosts, report-uri).
//   3. A fresh nonce is minted per request, surfaced via x-nonce on both the
//      forwarded request headers (so server components can read it via
//      `headers()`) and the response (so external observers can correlate).
//   4. The CSP `script-src` references the same nonce that x-nonce exposes.
//
// Note: tests exercise non-/command paths so auth (Supabase) is not reached.

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

function makeRequest(path = '/'): NextRequest {
  return new NextRequest(`http://localhost${path}`, { method: 'GET' });
}

describe('proxy — CSP report-only header (CRACK 211)', () => {
  it('sets Content-Security-Policy-Report-Only on the response', async () => {
    const res = await proxy(makeRequest('/field'));
    const csp = res.headers.get('Content-Security-Policy-Report-Only');
    expect(csp).toBeTruthy();
  });

  it('does NOT set the enforcing Content-Security-Policy header (report-only phase)', async () => {
    const res = await proxy(makeRequest('/'));
    expect(res.headers.get('Content-Security-Policy')).toBeNull();
  });

  it('emits the spec directive set, including required hosts and report-uri', async () => {
    const res = await proxy(makeRequest('/'));
    const csp = res.headers.get('Content-Security-Policy-Report-Only')!;
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' https:\/\/js\.stripe\.com/);
    expect(csp).toMatch(/style-src 'self' 'unsafe-inline'/);
    expect(csp).toMatch(/connect-src[^;]*https:\/\/\*\.supabase\.co/);
    expect(csp).toMatch(/connect-src[^;]*wss:\/\/\*\.supabase\.co/);
    expect(csp).toMatch(/connect-src[^;]*https:\/\/api\.stripe\.com/);
    expect(csp).toMatch(/connect-src[^;]*https:\/\/r\.stripe\.com/);
    expect(csp).toMatch(/frame-src https:\/\/js\.stripe\.com https:\/\/hooks\.stripe\.com/);
    expect(csp).toMatch(/worker-src 'self' blob:/);
    expect(csp).toMatch(/manifest-src 'self'/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).toMatch(/base-uri 'self'/);
    expect(csp).toMatch(/form-action 'self'/);
    expect(csp).toMatch(/report-uri \/api\/csp-report/);
  });

  it('omits Vercel Analytics hosts (OQ1 default — analytics not enabled)', async () => {
    const csp = (await proxy(makeRequest('/'))).headers.get('Content-Security-Policy-Report-Only')!;
    expect(csp).not.toMatch(/vitals\.vercel-analytics\.com/);
    expect(csp).not.toMatch(/va\.vercel-scripts\.com/);
  });

  it('does not allow unsafe-inline / unsafe-eval in script-src (the whole point of the tighter policy)', async () => {
    const csp = (await proxy(makeRequest('/'))).headers.get('Content-Security-Policy-Report-Only')!;
    const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src')) ?? '';
    expect(scriptSrc).not.toMatch(/'unsafe-inline'/);
    expect(scriptSrc).not.toMatch(/'unsafe-eval'/);
  });

  it('reflects the same nonce in the script-src directive and the x-nonce response header', async () => {
    const res = await proxy(makeRequest('/'));
    const nonce = res.headers.get('x-nonce');
    const csp = res.headers.get('Content-Security-Policy-Report-Only')!;
    expect(nonce).toBeTruthy();
    expect(csp).toContain(`'nonce-${nonce}'`);
  });

  it('mints a fresh nonce per request', async () => {
    const a = (await proxy(makeRequest('/'))).headers.get('x-nonce');
    const b = (await proxy(makeRequest('/'))).headers.get('x-nonce');
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });
});
