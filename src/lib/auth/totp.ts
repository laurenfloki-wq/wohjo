// W6(b) -- RFC 6238 TOTP (HMAC-SHA1, 6 digits, 30-second step) built on
// node:crypto only. No new dependency: the algorithm is ~40 lines and
// the RFC 4226/6238 test vectors pin it in totp.test.ts.
//
// Pure functions; no I/O. Persistence and policy live in admin-mfa.ts.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Accept codes from +/- this many steps around now (clock skew). */
export const TOTP_WINDOW = 1;

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += B32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160-bit secret per RFC 4226 recommendation, base32-encoded. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** RFC 4226 HOTP: HMAC-SHA1(secret, counter) -> dynamic truncation -> 6 digits. */
export function hotp(secretBase32: string, counter: number): string {
  const key = base32Decode(secretBase32);
  const msg = Buffer.alloc(8);
  // Counter as 8-byte big-endian. Steps fit comfortably in a JS number
  // (Date.now()/30000 ~ 5.9e7) so no BigInt needed; high bytes stay 0.
  msg.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  msg.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac('sha1', key).update(msg).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const bin =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(bin % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

export function currentStep(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
}

export interface TotpVerifyResult {
  ok: boolean;
  /** The accepted step on success; persist as last_used_step for replay defence. */
  step?: number;
}

/**
 * Verify a 6-digit code against the secret, accepting +/- TOTP_WINDOW
 * steps of clock skew. Steps at or below `lastUsedStep` are rejected
 * even when cryptographically valid -- a code is single-use.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  opts: { lastUsedStep?: number; nowMs?: number; window?: number } = {},
): TotpVerifyResult {
  if (!/^[0-9]{6}$/.test(code)) return { ok: false };
  const window = opts.window ?? TOTP_WINDOW;
  const now = currentStep(opts.nowMs ?? Date.now());
  const last = opts.lastUsedStep ?? 0;
  const given = Buffer.from(code, 'utf8');
  for (let offset = -window; offset <= window; offset++) {
    const step = now + offset;
    if (step <= last) continue; // replay defence
    const expected = Buffer.from(hotp(secretBase32, step), 'utf8');
    if (expected.length === given.length && timingSafeEqual(expected, given)) {
      return { ok: true, step };
    }
  }
  return { ok: false };
}

/** otpauth:// URI for authenticator-app enrolment (QR or manual entry). */
export function otpauthUri(secretBase32: string, accountLabel: string, issuer = 'WOHJO'): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
