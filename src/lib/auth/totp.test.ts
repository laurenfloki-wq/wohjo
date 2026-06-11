import { describe, it, expect } from 'vitest';
import {
  base32Encode,
  base32Decode,
  generateTotpSecret,
  hotp,
  currentStep,
  verifyTotp,
  otpauthUri,
  TOTP_STEP_SECONDS,
} from './totp';

// RFC 6238 Appendix B test vectors (SHA-1). The RFC secret is the ASCII
// string "12345678901234567890"; RFC vectors are 8 digits -- our 6-digit
// codes are the last 6 of each.
const RFC_SECRET_B32 = base32Encode(Buffer.from('12345678901234567890', 'utf8'));
const RFC_VECTORS: Array<[number, string]> = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

describe('base32', () => {
  it('round-trips arbitrary bytes', () => {
    const buf = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 42]);
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
  });
  it('encodes the RFC secret to the canonical base32 form', () => {
    expect(RFC_SECRET_B32).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });
  it('rejects invalid characters', () => {
    expect(() => base32Decode('abc1!')).toThrow();
  });
});

describe('hotp / RFC 6238 vectors', () => {
  for (const [t, code8] of RFC_VECTORS) {
    it(`T=${t} -> ...${code8.slice(2)}`, () => {
      const step = Math.floor(t / TOTP_STEP_SECONDS);
      expect(hotp(RFC_SECRET_B32, step)).toBe(code8.slice(2));
    });
  }
});

describe('verifyTotp', () => {
  const nowMs = 1111111111 * 1000;
  const step = Math.floor(1111111111 / TOTP_STEP_SECONDS);

  it('accepts the current-step code and returns the step', () => {
    const r = verifyTotp(RFC_SECRET_B32, '050471', { nowMs });
    expect(r).toEqual({ ok: true, step });
  });

  it('accepts a previous-step code within the window (clock skew)', () => {
    const prev = hotp(RFC_SECRET_B32, step - 1);
    expect(verifyTotp(RFC_SECRET_B32, prev, { nowMs }).ok).toBe(true);
  });

  it('rejects a code outside the window', () => {
    const stale = hotp(RFC_SECRET_B32, step - 5);
    expect(verifyTotp(RFC_SECRET_B32, stale, { nowMs }).ok).toBe(false);
  });

  it('rejects replay: a step at or below lastUsedStep never verifies', () => {
    const r1 = verifyTotp(RFC_SECRET_B32, '050471', { nowMs });
    expect(r1.ok).toBe(true);
    const r2 = verifyTotp(RFC_SECRET_B32, '050471', { nowMs, lastUsedStep: r1.step ?? 0 });
    expect(r2.ok).toBe(false);
  });

  it('rejects malformed codes without computing anything', () => {
    expect(verifyTotp(RFC_SECRET_B32, '12345', { nowMs }).ok).toBe(false);
    expect(verifyTotp(RFC_SECRET_B32, 'abcdef', { nowMs }).ok).toBe(false);
  });
});

describe('generateTotpSecret / otpauthUri', () => {
  it('generates a 160-bit (32-char base32) secret', () => {
    const s = generateTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(generateTotpSecret()).not.toBe(s);
  });
  it('builds a standards-shaped otpauth URI', () => {
    const uri = otpauthUri('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 'admin@example.com');
    expect(uri.startsWith('otpauth://totp/WOHJO%3Aadmin%40example.com?')).toBe(true);
    expect(uri).toContain('secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(uri).toContain('issuer=WOHJO');
    expect(uri).toContain('period=30');
  });
  it('currentStep uses 30-second steps', () => {
    expect(currentStep(59_000)).toBe(1);
    expect(currentStep(60_000)).toBe(2);
  });
});
