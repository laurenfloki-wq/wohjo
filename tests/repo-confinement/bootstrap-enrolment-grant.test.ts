import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// W2(2) ship — the phone-OTP bootstrap mints the passkey enrolment grant in
// both sign-in paths, fail-soft (never blocks sign-in), and only from the
// phone-OTP route (so passkey login never self-perpetuates enrolment).
const SRC = readFileSync(
  join(__dirname, '..', '..', 'src/app/api/field/bootstrap-worker/route.ts'),
  'utf8',
);

describe('bootstrap-worker enrolment-grant wiring', () => {
  it('mints the enrolment grant via mintPhoneOtpEnrolmentGrant', () => {
    expect(SRC).toMatch(/mintPhoneOtpEnrolmentGrant/);
  });
  it('mints in BOTH success paths (already-linked + freshly-linked)', () => {
    const calls = SRC.match(/await tryMintEnrolmentGrant\(/g) ?? [];
    expect(calls.length).toBe(2);
  });
  it('is fail-soft — a mint failure is caught and logged, never thrown', () => {
    expect(SRC).toMatch(/catch \(e\)[\s\S]*enrolment_grant_failed/);
  });
});
