// CRACK 211 — middleware CSP header tests
//
// What this verifies:
//   1. Every response carries the Content-Security-Policy-Report-Only header.
//   2. The header is the spec policy (directive set, hosts, report-uri).
//   3. A fresh nonce is minted per request, surfaced via x-nonce on both the
//      forwarded request headers (so server components can read it via
//      `headers()`) and the response (so external observers can correlate).
//   4. The CSP `script-src` references the same nonce that x-nonce exposes.

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

function makeRequest(path = '/'): NextRequest {
  return new NextRequest(`http://localhost${path}`, { method: 'GET' });
}

describe('middleware — CSP report-only header', () => {
  it('sets Content-Security-Policy-Report-Only on the response', () => {
    const res = middleware(makeRequest('/field'));
    const csp = res.headers.get('Content-Security-Policy-Report-Only');
    expect(csp).toBeTruthy();
  });

  it('does NOT set the enforcing Content-Security-Policy header (report-only phase)', () => {
    const res = middleware(makeRequest('/'));
    expect(res.headers.get('Content-Security-Policy')).toBeNull();
  });

  it('emits the spec directive set, including required hosts and report-uri', () => {
    const res = middleware(makeRequest('/'));
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

  it('omits Vercel Analytics hosts (OQ1 default — analytics not enabled)', () => {
    const csp = middleware(makeRequest('/')).headers.get('Content-Security-Policy-Report-Only')!;
    expect(csp).not.toMatch(/vitals\.vercel-analytics\.com/);
    expect(csp).not.toMatch(/va\.vercel-scripts\.com/);
  });

  it('does not allow unsafe-inline / unsafe-eval in script-src (the whole point of the tighter policy)', () => {
    const csp = middleware(makeRequest('/')).headers.get('Content-Security-Policy-Report-Only')!;
    const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src')) ?? '';
    expect(scriptSrc).not.toMatch(/'unsafe-inline'/);
    expect(scriptSrc).not.toMatch(/'unsafe-eval'/);
  });

  it('reflects the same nonce in the script-src directive and the x-nonce response header', () => {
    const res = middleware(makeRequest('/'));
    const nonce = res.headers.get('x-nonce');
    const csp = res.headers.get('Content-Security-Policy-Report-Only')!;
    expect(nonce).toBeTruthy();
    expect(csp).toContain(`'nonce-${nonce}'`);
  });

  it('mints a fresh nonce per request', () => {
    const a = middleware(makeRequest('/')).headers.get('x-nonce');
    const b = middleware(makeRequest('/')).headers.get('x-nonce');
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });
});
