// Stripe connector — typed fetch wrapper with its own scoped credential.
// Used by bots 34 (bookkeeping), 35 (invoicing), 36 (reconciliation),
// 37 (dunning), 41 (usage-metering integrity).

import { requireEnv } from '../env';

const STRIPE_API = 'https://api.stripe.com/v1';

async function stripeGet<T>(path: string): Promise<T> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: { authorization: `Bearer ${requireEnv('STRIPE_SECRET_KEY')}` },
  });
  if (!res.ok) throw new Error(`Stripe GET ${path} -> ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export interface StripeCharge {
  id: string;
  amount: number;
  currency: string;
  fee?: number;
  created: number;
}

/** Retrieve a balance transaction (fees + net) for GST/fee mapping. */
export async function getBalanceTransaction(id: string): Promise<{
  id: string;
  amount: number;
  fee: number;
  net: number;
  currency: string;
}> {
  return stripeGet(`/balance_transactions/${id}`);
}

/**
 * Verify a Stripe webhook signature (HMAC-SHA256 over `${t}.${payload}`).
 * Edge Function receivers call this before enqueueing. Returns true if valid.
 */
export async function verifyWebhookSignature(
  payload: string,
  sigHeader: string,
  secret: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  const parts = Object.fromEntries(
    sigHeader.split(',').map((kv) => {
      const [k, v] = kv.split('=');
      return [k ?? '', v ?? ''];
    }),
  );
  const t = parts['t'];
  const v1 = parts['v1'];
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSeconds) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(expected, v1);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
