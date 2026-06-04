// PREVIEW-ONLY auto-sign-in — review aid, NOT a product feature.
//
// MUST STRIP BEFORE MERGE (or be proved inert by an absent
// `FLOS_PREVIEW_LOGIN` env var on every non-preview target).
//
// Why this exists: the design/command-ada preview deploy needs Lauren
// (the director) to land on /command/* without round-tripping SMS OTP.
// Visual review only. Real data, real RLS — we mint a real Supabase
// session for the director's existing user; we do NOT bypass RLS or
// proxy service-role reads through the page.
//
// Hard rails encoded here:
//   1. Env-gated: route 404s unless FLOS_PREVIEW_LOGIN === '1'.
//   2. The /command guard in src/proxy.ts is untouched. It still kicks
//      unauthenticated requests to /field?redirect=… — this route just
//      gives Lauren a one-click way to become authenticated.
//   3. No ledger writes (shift_events untouched).
//   4. The only mutation is a transient swap on auth.users.email
//      (NULL -> placeholder -> NULL) so we can mint a magic-link token
//      for a phone-only user. The director's encrypted_password is
//      NEVER touched. The email is restored to its original NULL state
//      via the postgres connection (auth schema, service-role driver)
//      before the route returns. If the restore fails we surface the
//      error rather than silently leaking the placeholder.
//
// Removal: delete this file + the test, then unset the env var on
// every Vercel scope.

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import postgres from 'postgres';

export const dynamic = 'force-dynamic';

const PREVIEW_DIRECTOR_ID = 'fb9110c8-bea7-4fc4-8a1e-7c3bc45c71c7';

function notFound(): NextResponse {
  // Use 404 (not 403) so an unauthorised probe can't even confirm the
  // route exists when the flag is absent.
  return new NextResponse('Not found', { status: 404 });
}

async function restoreEmail(originalEmail: string | null): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not configured — cannot restore preview email');
  }
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    if (originalEmail === null) {
      await sql`
        UPDATE auth.users
           SET email = NULL,
               email_confirmed_at = NULL
         WHERE id = ${PREVIEW_DIRECTOR_ID}::uuid
      `;
    } else {
      await sql`
        UPDATE auth.users
           SET email = ${originalEmail}
         WHERE id = ${PREVIEW_DIRECTOR_ID}::uuid
      `;
    }
  } finally {
    await sql.end({ timeout: 2 });
  }
}

export async function GET(request: NextRequest) {
  if (process.env.FLOS_PREVIEW_LOGIN !== '1') {
    return notFound();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !serviceRole) {
    return NextResponse.json(
      { error: 'Supabase preview login is not configured.' },
      { status: 503 },
    );
  }

  const admin = createServiceClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: lookup, error: lookupErr } =
    await admin.auth.admin.getUserById(PREVIEW_DIRECTOR_ID);
  if (lookupErr || !lookup?.user) {
    return NextResponse.json(
      { error: lookupErr?.message ?? 'Director user not found' },
      { status: 500 },
    );
  }
  const originalEmail = lookup.user.email ?? null;

  const tempEmail = `preview-login-${Date.now()}@flostruction.invalid`;
  const { error: setErr } = await admin.auth.admin.updateUserById(PREVIEW_DIRECTOR_ID, {
    email: tempEmail,
    email_confirm: true,
  });
  if (setErr) {
    return NextResponse.json(
      { error: `Could not stage preview login: ${setErr.message}` },
      { status: 500 },
    );
  }

  let session: { access_token: string; refresh_token: string } | null = null;
  let outErr: string | null = null;

  try {
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: tempEmail,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      throw new Error(linkErr?.message ?? 'No magic-link token returned');
    }
    const tokenHash = linkData.properties.hashed_token;

    const cookieStore = await cookies();
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet) {
          toSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    });

    const { data: verifyData, error: verifyErr } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'magiclink',
    });
    if (verifyErr || !verifyData?.session) {
      throw new Error(verifyErr?.message ?? 'verifyOtp did not return a session');
    }
    session = {
      access_token: verifyData.session.access_token,
      refresh_token: verifyData.session.refresh_token,
    };
  } catch (err) {
    outErr = err instanceof Error ? err.message : String(err);
  } finally {
    // Always restore — even if everything above failed.
    try {
      await restoreEmail(originalEmail);
    } catch (restoreErr) {
      // Surface the restore failure rather than silently leaking the
      // placeholder email on the director's row.
      const msg = restoreErr instanceof Error ? restoreErr.message : String(restoreErr);
      outErr = outErr
        ? `${outErr}; email restore also failed: ${msg}`
        : `Email restore failed: ${msg}`;
    }
  }

  if (outErr || !session) {
    return NextResponse.json(
      { error: outErr ?? 'Could not establish preview session.' },
      { status: 500 },
    );
  }

  const res = NextResponse.redirect(new URL('/command/dashboard', request.url));
  // Belt-and-braces — verifyOtp already set the cookies via the SSR
  // cookieStore.setAll callback; we also annotate the response so a
  // future caller can confirm a preview session was established.
  res.headers.set('x-flos-preview-login', '1');
  return res;
}
