// Saturday Shape A — Task A3: Stripe Checkout Session creator.
//
// POST /api/stripe/checkout
//
// Creates a Stripe Checkout Session for the requested pricing tier +
// billing cadence, embedding signup metadata in client_reference_id +
// session metadata so the checkout.session.completed webhook handler
// can resolve back to the in-progress signup.
//
// Substrate-DD context: Friday's Shape A audit (Section 2.4) flagged
// this endpoint as a Shape A blocker. The webhook handler at
// onCheckoutSessionCompleted (Saturday Task A3 commit) reads the
// session and invokes provision_tenant_from_checkout RPC (Task A1).
//
// Test mode only per Friday founder decision. The Stripe API base URL
// is the same for live + test mode; the secret key (sk_test_... vs
// sk_live_...) determines which mode the call hits. Lauren swaps the
// env var for the live-mode cutover after smoke-test passes.
//
// Implementation choice: raw fetch against Stripe's HTTP API rather
// than adding the `stripe` npm package. Keeps the dependency surface
// small (matches the pattern at src/lib/stripe/webhook-signature.ts
// which does HMAC verification manually). Stripe's REST API is stable
// and well-documented.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { tierById, type PricingTier, type BillingCadence } from '../../../../lib/stripe/pricing';
import { checkRateLimit, getClientIP } from '../../../../lib/security/rate-limit';
import { routeLogger } from '../../../../lib/logger';

export const runtime = 'nodejs';

const CheckoutSchema = z.object({
  pricing_tier: z.enum(['founding', 'standard', 'growth', 'scale', 'enterprise']),
  billing_cadence: z.enum(['monthly', 'yearly']),
  signup_metadata: z.object({
    email: z.string().email().max(200),
    company_name: z.string().min(1).max(200),
    abn_digits: z.string().regex(/^[0-9]{11}$/, '11-digit ABN required'),
    admin_user_id: z.string().uuid('admin_user_id must be the authenticated user id'),
  }),
});

interface ClientReferenceClaims {
  /** auth.users.id of the registering admin */
  uid: string;
  /** signup metadata captured pre-checkout */
  meta: {
    email: string;
    company_name: string;
    abn_digits: string;
  };
  /** issued-at unix seconds */
  iat: number;
  /** expires-at unix seconds — 15 min after iat */
  exp: number;
}

const TOKEN_TTL_SECONDS = 15 * 60;

/**
 * Sign a short-lived JSON payload as the client_reference_id token.
 * Format: base64url(payload).base64url(hmac-sha256(payload, SECRET)).
 * Verified by the webhook handler before invoking provision RPC.
 */
function signClientReference(claims: ClientReferenceClaims): string {
  const secret = process.env.STRIPE_CLIENT_REF_SECRET;
  if (!secret) {
    throw new Error('STRIPE_CLIENT_REF_SECRET is required for checkout client_reference_id signing');
  }
  const payload = Buffer.from(JSON.stringify(claims), 'utf-8').toString('base64url');
  const hmac = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${hmac}`;
}

/**
 * Verify + decode a client_reference_id token. Exported for the
 * webhook handler. Returns null on signature failure or expiry.
 */
export function verifyClientReference(token: string): ClientReferenceClaims | null {
  if (!token || !token.includes('.')) return null;
  const secret = process.env.STRIPE_CLIENT_REF_SECRET;
  if (!secret) return null;

  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;

  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const expectedBuf = Buffer.from(expected);
  const sigBuf = Buffer.from(sig);
  if (expectedBuf.length !== sigBuf.length) return null;
  if (!timingSafeEqual(expectedBuf, sigBuf)) return null;

  let claims: ClientReferenceClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as ClientReferenceClaims;
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || now > claims.exp) return null;
  return claims;
}

interface StripeCheckoutSessionResponse {
  id: string;
  url: string;
  status: string;
}

async function createCheckoutSession(opts: {
  customerEmail: string;
  lookupKey: string;
  clientReferenceId: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}): Promise<StripeCheckoutSessionResponse> {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error('STRIPE_SECRET_KEY is required');

  // Stripe expects application/x-www-form-urlencoded with bracketed
  // keys for nested objects. Build the form body manually so we don't
  // need to pull in the stripe npm package.
  const form = new URLSearchParams();
  form.set('mode', 'subscription');
  form.set('customer_email', opts.customerEmail);
  form.set('client_reference_id', opts.clientReferenceId);
  form.set('success_url', opts.successUrl);
  form.set('cancel_url', opts.cancelUrl);
  // Lookup price by lookup_key — Stripe expands lookup_keys[] →
  // line_items[0].price. Requires `expand[]=line_items` to confirm
  // the price was resolved, but we don't need to read line_items in
  // the response so we skip the expand.
  form.set('line_items[0][price]', '');  // overwritten below via lookup_keys
  form.delete('line_items[0][price]');
  form.set('line_items[0][quantity]', '1');
  // Use a price lookup_key in line_items via the documented form:
  // Stripe lets you specify line_items[0][price] OR you list lookup
  // keys at the top-level lookup_keys[] for price lookup.
  form.set('lookup_keys[]', opts.lookupKey);
  // Embed metadata for the webhook handler to inspect.
  for (const [k, v] of Object.entries(opts.metadata)) {
    form.set(`metadata[${k}]`, v);
  }

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-06-20',
    },
    body: form.toString(),
  });

  const json = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    const errMsg = (json.error as { message?: string } | undefined)?.message
      ?? `Stripe API error (status ${res.status})`;
    throw new Error(errMsg);
  }
  return {
    id: json.id as string,
    url: json.url as string,
    status: json.status as string,
  };
}

export async function POST(request: Request) {
  const log = routeLogger('POST /api/stripe/checkout', request.headers.get('x-request-id'));
  log.info({ method: 'POST' }, 'request.received');

  // Rate limit per-IP. Checkout creation is a Stripe-billable surface
  // and a public endpoint; protect against abuse.
  const ip = getClientIP(request);
  const rl = checkRateLimit(`stripe.checkout:${ip}`, {
    maxRequests: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    log.warn({ ip }, 'stripe.checkout.rate_limit.exceeded');
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again in an hour.' },
      { status: 429 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parsed = CheckoutSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.issues },
      { status: 400 },
    );
  }
  const { pricing_tier, billing_cadence, signup_metadata } = parsed.data;

  // Resolve canonical lookup_key from the pricing tier table. Yearly
  // billing for tiers without a yearly price (founding, enterprise)
  // is rejected.
  const tier = tierById(pricing_tier as PricingTier);
  const cadence = billing_cadence as BillingCadence;
  const lookupKey = cadence === 'yearly' ? tier.stripe_lookup_yearly : tier.stripe_lookup_monthly;
  if (!lookupKey) {
    return NextResponse.json(
      { error: `Tier "${pricing_tier}" does not offer ${cadence} billing` },
      { status: 400 },
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const claims: ClientReferenceClaims = {
    uid: signup_metadata.admin_user_id,
    meta: {
      email: signup_metadata.email,
      company_name: signup_metadata.company_name,
      abn_digits: signup_metadata.abn_digits,
    },
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };

  let clientReferenceId: string;
  try {
    clientReferenceId = signClientReference(claims);
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'stripe.checkout.token_sign_failed');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://flosmosis.com';
  // session_id macro is replaced by Stripe at redirect time.
  const successUrl = `${appUrl}/setting-up?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${appUrl}/get-started?cancelled=1`;

  // Idempotency on the metadata.signup_idempotency key — surfaced
  // primarily so the webhook handler can confirm one-checkout-per-
  // signup if needed.
  const signupIdempotency = randomUUID();

  let session: StripeCheckoutSessionResponse;
  try {
    session = await createCheckoutSession({
      customerEmail: signup_metadata.email,
      lookupKey,
      clientReferenceId,
      successUrl,
      cancelUrl,
      metadata: {
        pricing_tier,
        billing_cadence,
        signup_idempotency: signupIdempotency,
      },
    });
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : String(err) },
      'stripe.checkout.session_create_failed',
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not create checkout session' },
      { status: 502 },
    );
  }

  log.info(
    { sessionId: session.id, pricing_tier, billing_cadence },
    'stripe.checkout.session_created',
  );

  return NextResponse.json({
    checkout_url: session.url,
    session_id: session.id,
  });
}
