// CRACK 211 — Content Security Policy (Report-Only phase)
// Source spec: Cowork CSP Integration Spec, Notion 35b06f9432dd812fade2ea05b9351859
// Local copy:  cowork-output/WS6-CSP-INTEGRATION-SPEC-2026-05-09.md
//
// Why this file ships REPORT-ONLY:
//   We collect 7 days of violation telemetry against Cowork's tighter policy
//   before promoting to enforce. The looser enforce CSP currently in
//   vercel.json continues to run unchanged — both headers coexist; browsers
//   treat them independently.
//
// Why a per-request nonce:
//   Next.js hydration scripts vary per request, so static SHA-256 hashes
//   don't work. We generate a fresh nonce per request, expose it to RSC via
//   the x-nonce request header (read in app/layout.tsx via `headers()`),
//   and reflect it into the CSP `script-src` directive on the response.
//
// Open question OQ1 (Vercel Analytics): no analytics package is installed in
// this app, so we OMIT vitals.vercel-analytics.com / va.vercel-scripts.com
// from connect-src. If we add Vercel Analytics later, those hosts get added
// back here and a violation report from /api/csp-report will tell us.

import { NextResponse, type NextRequest } from 'next/server';

const NONCE_BYTES = 16;

function generateNonce(): string {
  const bytes = new Uint8Array(NONCE_BYTES);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://js.stripe.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://r.stripe.com",
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    'report-uri /api/csp-report',
  ].join('; ');
}

export function middleware(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('x-csp-report-only', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set('Content-Security-Policy-Report-Only', csp);
  response.headers.set('x-nonce', nonce);

  return response;
}

// Skip the report endpoint (so violations from generating reports don't loop),
// Next internals, and prefetch requests (which don't render the layout).
export const config = {
  matcher: [
    {
      source: '/((?!api/csp-report|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
