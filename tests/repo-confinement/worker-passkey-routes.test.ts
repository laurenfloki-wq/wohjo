import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Phase A (WORKER_PASSKEY_ACCESS) — route confinement.
// The four passkey routes must go through the worker-passkey / ceremony seam
// (never a raw Supabase client), be flag-gated, and ALWAYS expose the SMS
// fallback. Registration must be gated on an active code-verify grant (the SMS
// floor). Mirrors tests/repo-confinement/w14c-*.

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const BASE = 'src/app/api/worker/passkey';
const ALL = [
  `${BASE}/register-options/route.ts`,
  `${BASE}/register-verify/route.ts`,
  `${BASE}/auth-options/route.ts`,
  `${BASE}/auth-verify/route.ts`,
];
const REGISTER = [`${BASE}/register-options/route.ts`, `${BASE}/register-verify/route.ts`];

describe('worker passkey routes — confinement + floor + fallback', () => {
  for (const route of ALL) {
    const src = read(route);
    it(`${route} touches no raw Supabase client`, () => {
      expect(src).not.toMatch(/@supabase\/supabase-js/);
      expect(src).not.toMatch(/createServiceClient|createClient\(/);
    });
    it(`${route} is gated on workerPasskeyAccessEnabled`, () => {
      expect(src).toMatch(/workerPasskeyAccessEnabled\(\)/);
    });
    it(`${route} exposes the SMS fallback on every response`, () => {
      // every JSON response object carries fallback: 'sms' (or returns ok:true).
      const responses = src.match(/NextResponse\.json\(\s*\{[^}]*\}/g) ?? [];
      expect(responses.length).toBeGreaterThan(0);
      for (const r of responses) {
        const ok = /fallback:\s*'sms'/.test(r) || /ok:\s*true/.test(r);
        expect(ok, `response without sms fallback in ${route}: ${r.slice(0, 60)}`).toBe(true);
      }
    });
  }

  for (const route of REGISTER) {
    it(`${route} requires an active code-verify grant (the SMS floor)`, () => {
      const src = read(route);
      expect(src).toMatch(/hasActiveCodeVerifyGrant/);
      expect(src).toMatch(/SMS_VERIFY_REQUIRED/);
    });
  }

  it('auth-verify issues the grant via the ceremony seam + binds the device', () => {
    const src = read(`${BASE}/auth-verify/route.ts`);
    expect(src).toMatch(/authVerify\(/);
    expect(src).toMatch(/deviceBindingFromUserAgent/);
  });

  it('no route writes to shift_events or the WLES chain (auth-only, A is not B)', () => {
    for (const route of ALL) {
      const src = read(route);
      expect(src).not.toMatch(
        /shift_events|generateEventHash|wles_event|insertV1Event|WORKER_EVENT_SIGNING/,
      );
    }
  });
});
