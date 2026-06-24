// W2 — worker passkey UX (enrolment offer + device management).
// Source-assertion battery (the repo runs vitest in node env, no jsdom). Pins
// the UX guarantees: skippable first-run, device list + revoke, and the SMS
// fallback present on every state.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'PasskeyManager.tsx'), 'utf8');

describe('PasskeyManager UX', () => {
  it('first-run enrolment is skippable (Skip for now → /field/home), never mandatory', () => {
    expect(SRC).toMatch(/firstRun/);
    expect(SRC).toMatch(/Skip for now/);
    expect(SRC).toMatch(/\/field\/home/);
  });

  it('lists enrolled devices and offers revoke (DELETE the credential)', () => {
    expect(SRC).toMatch(/\/api\/worker\/passkey\/credentials/);
    expect(SRC).toMatch(/handleRevoke/);
    expect(SRC).toMatch(/'DELETE'/);
    expect(SRC).toMatch(/Remove/);
  });

  it('reassures that removing the last device falls back to SMS (no lockout)', () => {
    expect(SRC.toLowerCase()).toMatch(/last device/);
    expect(SRC).toMatch(/Use a one-time SMS code instead/);
  });

  it('passkey sign-in failure/cancel routes to the SMS fallback (no dead-end)', () => {
    expect(SRC).toMatch(/Use an SMS code instead/);
    // Any thrown/cancelled ceremony sets an error state that still shows SMS.
    expect(SRC).toMatch(/catch\s*\{/);
  });

  it('does not mint or perpetuate grants (UX is auth-only; enrolment stays SMS-gated)', () => {
    expect(SRC).not.toMatch(/worker_mfa_grants|mintAppAccessGrant/);
    // Enrolment still bounces to the SMS floor when no code-verify grant exists.
    expect(SRC).toMatch(/SMS_VERIFY_REQUIRED/);
  });
});
