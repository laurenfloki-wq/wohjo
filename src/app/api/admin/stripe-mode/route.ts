// CRACK 225 / WS6 — Stripe live-mode verification endpoint.
//
// GET /api/admin/stripe-mode
//
// Returns the current Stripe mode (test vs live) inferred from the
// STRIPE_SECRET_KEY environment variable's prefix. Used by Lauren post-
// rotation to confirm the live-mode flip took effect on Vercel without
// having to make a live charge or grep production logs.
//
// Auth: admin-only. Reuses requireCompanyMembership-style session
// resolution via getCompanyIdForSession; any authenticated company
// admin may call this (it does not expose secrets, only the prefix).
//
// Returns:
//   { mode: 'test' | 'live' | 'unconfigured',
//     key_prefix: 'sk_test' | 'sk_live' | null,
//     webhook_secret_configured: boolean,
//     webhook_secret_prefix: 'whsec_test' | 'whsec' | null,
//     publishable_key_prefix: 'pk_test' | 'pk_live' | null }
//
// Notes:
//   - Only the PREFIX of each key is returned (never the full secret).
//     Even an admin caller never sees the secret in transit.
//   - webhook_secret_prefix uses the convention 'whsec_test_*' for
//     Stripe test-mode webhook signing secrets and 'whsec_*' for live;
//     we surface a best-effort detection rather than throwing.
//   - publishable_key_prefix reads NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
//     even though it's a public key — included so Lauren can verify all
//     three Vercel env vars rotated together.

import { NextResponse } from 'next/server';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { routeLogger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StripeMode = 'test' | 'live' | 'unconfigured';

function detectMode(secret: string | undefined): {
  mode: StripeMode;
  key_prefix: 'sk_test' | 'sk_live' | null;
} {
  if (!secret) return { mode: 'unconfigured', key_prefix: null };
  if (secret.startsWith('sk_test_')) return { mode: 'test', key_prefix: 'sk_test' };
  if (secret.startsWith('sk_live_')) return { mode: 'live', key_prefix: 'sk_live' };
  return { mode: 'unconfigured', key_prefix: null };
}

function detectWebhookPrefix(secret: string | undefined): 'whsec_test' | 'whsec' | null {
  if (!secret) return null;
  // Stripe test-mode webhook secrets carry the literal 'whsec_test_' prefix
  // in the dashboard; live-mode secrets are 'whsec_' followed by random.
  if (secret.startsWith('whsec_test_')) return 'whsec_test';
  if (secret.startsWith('whsec_')) return 'whsec';
  return null;
}

function detectPublishablePrefix(key: string | undefined): 'pk_test' | 'pk_live' | null {
  if (!key) return null;
  if (key.startsWith('pk_test_')) return 'pk_test';
  if (key.startsWith('pk_live_')) return 'pk_live';
  return null;
}

export async function GET(request: Request): Promise<Response> {
  const log = routeLogger('GET /api/admin/stripe-mode', request.headers.get('x-request-id'));

  // Auth: any authenticated company admin may inspect (no secrets returned).
  try {
    await getCompanyIdForSession(log);
  } catch (err) {
    return authErrorResponse(err);
  }

  const { mode, key_prefix } = detectMode(process.env.STRIPE_SECRET_KEY);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const publishable = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  log.info({ mode, key_prefix }, 'stripe.mode.inspected');

  return NextResponse.json({
    mode,
    key_prefix,
    webhook_secret_configured: !!webhookSecret,
    webhook_secret_prefix: detectWebhookPrefix(webhookSecret),
    publishable_key_prefix: detectPublishablePrefix(publishable),
  });
}
