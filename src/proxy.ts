// Flostruction — Next.js Proxy (formerly middleware.ts; renamed per
// Next.js 16 deprecation of the `middleware` file convention)
// CRITICAL-001: All /command/* routes require authentication.
// Unauthenticated requests redirect to the login page.
// Non-negotiable: no command route ever renders without a valid session.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only gate /command routes (pages, not API — API routes use requireCommandAuth)
  if (!pathname.startsWith('/command')) {
    return NextResponse.next();
  }

  // Create a Supabase client using cookies
  let response = NextResponse.next({
    request: { headers: request.headers },
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
              request: { headers: request.headers },
            });
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Redirect to field login — the only login page in Flostruction
    const loginUrl = new URL('/field', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ['/command/:path*'],
};
