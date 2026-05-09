// Supabase Auth Hook — Standard Webhooks signature verification.
//
// Supabase signs Auth Hook requests using the Standard Webhooks spec:
//   https://www.standardwebhooks.com/
//
// Headers: svix-id, svix-timestamp, svix-signature
// Signed message: "<svix-id>.<svix-timestamp>.<raw-body>"
// Secret: SUPABASE_HOOK_SECRET in "v1,whsec_<base64>" format.
//   Strip "v1,whsec_" prefix, base64-decode → raw bytes for HMAC key.
// Expected signature: base64(HMAC-SHA256(key, message))
// Signature header: one or more comma-separated "v1,<base64sig>" values.

import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifySupabaseHookSignature(
  rawBody: string,
  svixId: string | null,
  svixTimestamp: string | null,
  svixSignature: string | null,
): boolean {
  const secretEnv = process.env.SUPABASE_HOOK_SECRET;
  if (!secretEnv) return false;
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  // Decode the shared secret (strip "v1,whsec_" prefix then base64-decode).
  let keyBytes: Buffer;
  try {
    const b64 = secretEnv.startsWith('v1,whsec_')
      ? secretEnv.slice('v1,whsec_'.length)
      : secretEnv;
    keyBytes = Buffer.from(b64, 'base64');
  } catch {
    return false;
  }

  // Construct the signed message.
  const message = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = createHmac('sha256', keyBytes)
    .update(message, 'utf8')
    .digest('base64');

  // Header may contain multiple signatures: "v1,<sig1> v1,<sig2>"
  const candidates = svixSignature.split(' ');
  for (const candidate of candidates) {
    const sigB64 = candidate.startsWith('v1,') ? candidate.slice(3) : candidate;
    try {
      if (
        timingSafeEqual(Buffer.from(sigB64, 'base64'), Buffer.from(expected, 'base64'))
      ) {
        return true;
      }
    } catch {
      // Length mismatch — not a match; try next.
    }
  }
  return false;
}
