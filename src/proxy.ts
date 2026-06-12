// Flostruction — Next.js Proxy (formerly middleware.ts; renamed per
// Next.js 16 deprecation of the `middleware` file convention)
// CRITICAL-001: All /command/* routes require authentication.
// Unauthenticated requests redirect to the login page.
// Non-negotiable: no command route ever renders without a valid session.
//
// CRACK 211 — CSP nonce (ENFORCING). A fresh 16-byte nonce is
// minted per request and emitted as Content-Security-Policy-enforcing.
// The nonce is surfaced via x-nonce on the forwarded request so layout.tsx
// can read it via `headers()`. Source spec: Cowork CSP Integration Spec,
// Notion 35b06f9432dd812fade2ea05b9351859.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

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
    // 'strict-dynamic': scripts loaded BY nonced scripts (Next.js chunk
    // loading, Stripe.js children) inherit trust. CSP3 browsers then
    // ignore the host allowlist; https://js.stripe.com stays as the
    // CSP2 fallback.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://r.stripe.com",
    'frame-src https://js.stripe.com https://hooks.stripe.com',
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests',
    'report-uri /api/csp-report',
  ].join('; ');
}

function applyCsp(response: NextResponse, nonce: string, csp: string): NextResponse {
  // Enforcing (webpack build makes nonces apply; see next.config.ts).
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('x-nonce', nonce);
  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const nonce = generateNonce();
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Next.js App Router reads the REQUEST-side Content-Security-Policy
  // header to discover the nonce and stamp it onto every framework
  // inline script (the __next_f bootstrap pushes and chunk loaders).
  // Without this, those scripts carry no nonce and an enforcing flip
  // would block every page — caught live in the PR #93 pre-merge
  // device test (2026-06-12, console: 'Executing inline script
  // violates...'). Browsers never see request headers; the response
  // header set in applyCsp remains the externally visible policy.
  requestHeaders.set('Content-Security-Policy', csp);

  const { pathname } = request.nextUrl;

  // Only gate /command routes (pages, not API — API routes use getCompanyIdForSession)
  if (!pathname.startsWith('/command')) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    return applyCsp(response, nonce, csp);
  }

  // Create a Supabase client using cookies
  let response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response = NextResponse.next({
              request: { headers: requestHeaders },
            });
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Redirect to field login — the only login page in Flostruction
    const loginUrl = new URL('/field', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return applyCsp(response, nonce, csp);
}

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
