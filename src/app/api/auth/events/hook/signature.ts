// Supabase Auth Hook signature verification.
//
// Supabase signs Auth Hook HTTP requests with HMAC-SHA256. The signature
// arrives as the raw hex digest in the `x-supabase-signature` header.
// The signed content is the raw request body bytes.
//
// The shared secret is `SUPABASE_HOOK_SECRET` (set in Vercel env).
// Configure this in the Supabase Dashboard under Auth → Hooks when
// wiring the hook endpoint.

import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifySupabaseHookSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const secret = process.env.SUPABASE_HOOK_SECRET;
  if (!secret) return false;
  if (!signatureHeader) return false;

  const expected = createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');

  try {
    return timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  } catch {
    return false;
  }
}
