// Flostruction — Next.js Proxy (formerly middleware.ts; renamed per
// Next.js 16 deprecation of the `middleware` file convention)
// CRITICAL-001: All /command/* routes require authentication.
// Unauthenticated requests redirect to the login page.
// Non-negotiable: no command route ever renders without a valid session.
//
// CRACK 211 — CSP nonce (report-only phase). A fresh 16-byte nonce is
// minted per request and emitted as Content-Security-Policy-Report-Only.
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
    `script-src 'self' 'nonce-${nonce}' https://js.stripe.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://r.stripe.com",
    'frame-src https://js.stripe.com https://hooks.stripe.com',
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    'report-uri /api/csp-report',
  ].join('; ');
}

function applyCsp(response: NextResponse, nonce: string, csp: string): NextResponse {
  response.headers.set('Content-Security-Policy-Report-Only', csp);
  response.headers.set('x-nonce', nonce);
  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const nonce = generateNonce();
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const { pathname } = request.nextUrl;

  // Only gate /command routes (pages, not API — API routes use requireCommandAuth)
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
