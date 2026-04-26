// Stripe webhook signature verification.
// Implementation note: built on Node built-ins (crypto.createHmac) so
// it works without taking a runtime dep on the `stripe` npm SDK. The
// algorithm mirrors Stripe's documented v1 scheme:
// https://docs.stripe.com/webhooks#verify-manually
//
// Usage:
//   const isValid = verifyStripeSignature({
//     payload: rawBodyText,
//     header: req.headers.get('stripe-signature') ?? '',
//     secret: process.env.STRIPE_WEBHOOK_SECRET!,
//     toleranceSeconds: 300,
//   });
//
// Non-negotiable: called before ANY processing of inbound webhook
// payload. Mirrors `validateTwilioSignature` pattern in
// `src/lib/twilio/client.ts`.

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface VerifyInput {
  /** Raw request body as string (do NOT use parsed JSON — signature is over bytes) */
  payload: string;
  /** Value of the `Stripe-Signature` request header */
  header: string;
  /** Endpoint secret (whsec_...) from Stripe dashboard webhook config */
  secret: string;
  /** How far in the past the timestamp may be, in seconds. Stripe default 5 minutes. */
  toleranceSeconds?: number;
}

export interface VerifyResult {
  ok: boolean;
  /** When ok=false, why */
  reason?:
    | 'header_missing'
    | 'header_malformed'
    | 'timestamp_outside_tolerance'
    | 'signature_mismatch'
    | 'secret_missing';
}

/**
 * Parse a Stripe-Signature header into its `t` and `v1` parts.
 * Header shape: `t=1492774577,v1=hexsig,v0=oldsig`
 */
function parseHeader(h: string): { t: number | null; v1: string[] } {
  const parts = h.split(',');
  let t: number | null = null;
  const v1: string[] = [];
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    const k = p.slice(0, eq).trim();
    const v = p.slice(eq + 1).trim();
    if (k === 't') t = Number.parseInt(v, 10);
    if (k === 'v1') v1.push(v);
  }
  return { t, v1 };
}

export function verifyStripeSignature(input: VerifyInput): VerifyResult {
  const { payload, header, secret } = input;
  const tolerance = input.toleranceSeconds ?? 300;

  if (!secret) return { ok: false, reason: 'secret_missing' };
  if (!header) return { ok: false, reason: 'header_missing' };

  const { t, v1 } = parseHeader(header);
  if (t === null || Number.isNaN(t) || v1.length === 0) {
    return { ok: false, reason: 'header_malformed' };
  }

  // Tolerance check — reject very old or very future timestamps.
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - t) > tolerance) {
    return { ok: false, reason: 'timestamp_outside_tolerance' };
  }

  // Signed payload = `${t}.${rawBody}`. HMAC-SHA256 with the secret.
  const signed = `${t}.${payload}`;
  const expected = createHmac('sha256', secret).update(signed).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf-8');

  // Constant-time compare against ANY of the v1 signatures (Stripe sends one
  // during a key rotation window).
  for (const candidate of v1) {
    const candidateBuf = Buffer.from(candidate, 'utf-8');
    if (candidateBuf.length === expectedBuf.length &&
        timingSafeEqual(candidateBuf, expectedBuf)) {
      return { ok: true };
    }
  }

  return { ok: false, reason: 'signature_mismatch' };
}
