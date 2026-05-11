// CRACK 235 / WS4 — Stripe live-mode verification ping.
//
// GET /api/admin/stripe-ping
//
// Hits Stripe's `/v1/account` endpoint with the currently-configured
// STRIPE_SECRET_KEY and returns the resolved account's mode + id +
// display_name. Used by Lauren post-rotation to confirm the live-mode
// secret is valid + active without making a real charge.
//
// Auth: admin-only (any authenticated company admin). The endpoint
// never returns the secret itself, only metadata Stripe surfaces back
// for the authenticated account.
//
// Returned shape:
//   {
//     ok: true,
//     livemode: boolean,                  // true => sk_live_* in use
//     account_id: string,
//     display_name: string | null,
//     country: string | null,
//     details_submitted: boolean,         // KYC complete?
//     charges_enabled: boolean,
//     payouts_enabled: boolean,
//     prefix: 'sk_test' | 'sk_live' | 'unknown'
//   }
//
// Errors:
//   500 NO_KEY      — STRIPE_SECRET_KEY unset
//   500 STRIPE_ERR  — Stripe rejected the key or returned non-2xx;
//                     {detail} carries the Stripe error message
//
// Why a separate endpoint from /api/admin/stripe-mode (CRACK 225):
//   stripe-mode does PREFIX detection only — fast, no network call.
//   stripe-ping does a real authenticated round-trip — proves the key
//   isn't just shaped correctly but actually valid against Stripe's
//   servers. Different verification depths; both are useful.

import { NextResponse } from 'next/server';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { routeLogger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface StripeAccountResponse {
  id: string;
  business_profile?: { name?: string | null } | null;
  display_name?: string | null;
  country?: string;
  details_submitted?: boolean;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
}

interface StripeErrorResponse {
  error?: { message?: string; type?: string; code?: string };
}

function detectPrefix(secret: string): 'sk_test' | 'sk_live' | 'unknown' {
  if (secret.startsWith('sk_test_')) return 'sk_test';
  if (secret.startsWith('sk_live_')) return 'sk_live';
  return 'unknown';
}

export async function GET(request: Request): Promise<Response> {
  const log = routeLogger('GET /api/admin/stripe-ping', request.headers.get('x-request-id'));

  // Admin-only.
  try {
    await getCompanyIdForSession(log);
  } catch (err) {
    return authErrorResponse(err);
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    log.error({}, 'stripe.ping.no_key');
    return NextResponse.json(
      { ok: false, error: 'NO_KEY', message: 'STRIPE_SECRET_KEY is not set in this environment.' },
      { status: 500 },
    );
  }

  // Authenticated GET to Stripe's account endpoint. Basic auth with
  // the secret as the username; empty password.
  let stripeRes: Response;
  try {
    stripeRes = await fetch('https://api.stripe.com/v1/account', {
      method: 'GET',
      headers: {
        Authorization: 'Basic ' + Buffer.from(secret + ':').toString('base64'),
      },
    });
  } catch (err) {
    log.error({ err: String(err) }, 'stripe.ping.network_error');
    return NextResponse.json(
      {
        ok: false,
        error: 'NETWORK',
        message: err instanceof Error ? err.message : 'Network error',
      },
      { status: 502 },
    );
  }

  const prefix = detectPrefix(secret);

  if (!stripeRes.ok) {
    const errBody = (await stripeRes.json().catch(() => ({}))) as StripeErrorResponse;
    log.warn(
      { status: stripeRes.status, stripeError: errBody.error?.message, prefix },
      'stripe.ping.stripe_rejected',
    );
    return NextResponse.json(
      {
        ok: false,
        error: 'STRIPE_ERR',
        status: stripeRes.status,
        detail: errBody.error?.message ?? 'Stripe rejected the request',
        prefix,
      },
      { status: 500 },
    );
  }

  const account = (await stripeRes.json()) as StripeAccountResponse;
  // `livemode` is not directly on the account object — Stripe infers it from
  // the key used to authenticate. We surface it via the prefix.
  const livemode = prefix === 'sk_live';

  log.info(
    { accountId: account.id, livemode, prefix, country: account.country },
    'stripe.ping.success',
  );

  return NextResponse.json({
    ok: true,
    livemode,
    account_id: account.id,
    display_name: account.business_profile?.name ?? account.display_name ?? null,
    country: account.country ?? null,
    details_submitted: account.details_submitted ?? false,
    charges_enabled: account.charges_enabled ?? false,
    payouts_enabled: account.payouts_enabled ?? false,
    prefix,
  });
}
