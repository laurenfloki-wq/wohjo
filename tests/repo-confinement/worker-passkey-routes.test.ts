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

// W2 — device management (list + revoke).
describe('worker passkey credentials route — confinement + floor + fallback', () => {
  const route = `${BASE}/credentials/route.ts`;
  const src = read(route);

  it('goes through the worker-passkey seam (no raw Supabase client)', () => {
    expect(src).not.toMatch(/@supabase\/supabase-js/);
    expect(src).not.toMatch(/createServiceClient|createClient\(/);
  });
  it('is flag-gated on workerPasskeyAccessEnabled', () => {
    expect(src).toMatch(/workerPasskeyAccessEnabled\(\)/);
  });
  it('requires a worker identity (session-scoped)', () => {
    expect(src).toMatch(/requireWorkerIdentity/);
  });
  it('GET lists via listWorkerCredentials; DELETE revokes via revokeCredential', () => {
    expect(src).toMatch(/export async function GET/);
    expect(src).toMatch(/listWorkerCredentials/);
    expect(src).toMatch(/export async function DELETE/);
    expect(src).toMatch(/revokeCredential/);
  });
  it('every response carries the SMS fallback', () => {
    const responses = src.match(/NextResponse\.json\(\s*\{[^}]*\}/g) ?? [];
    expect(responses.length).toBeGreaterThan(0);
    for (const r of responses) {
      const ok = /fallback:\s*'sms'/.test(r) || /ok:\s*true/.test(r);
      expect(ok, `response without sms fallback: ${r.slice(0, 60)}`).toBe(true);
    }
  });
  it('does not mint or touch grants (no self-perpetuation; revoke is auth-only)', () => {
    expect(src).not.toMatch(/worker_mfa_grants|mintAppAccessGrant|APP_ACCESS/);
    expect(src).not.toMatch(
      /shift_events|generateEventHash|wles_event|insertV1Event|WORKER_EVENT_SIGNING/,
    );
  });
});

// W2(2) — app-open passkey login routes (pre-session).
describe('worker passkey app-open routes — gating + floor + fallback', () => {
  const OPEN = [`${BASE}/auth-options-open/route.ts`, `${BASE}/auth-verify-open/route.ts`];

  for (const route of OPEN) {
    const src = read(route);
    it(`${route} is gated on workerPasskeyLoginEnabled (flag AND secret)`, () => {
      expect(src).toMatch(/workerPasskeyLoginEnabled\(\)/);
    });
    it(`${route} touches no raw Supabase client`, () => {
      expect(src).not.toMatch(/@supabase\/supabase-js/);
      expect(src).not.toMatch(/createServiceClient|createClient\(/);
    });
    it(`${route} exposes the SMS fallback on every response`, () => {
      const responses = src.match(/NextResponse\.json\(\s*\{[^}]*\}/g) ?? [];
      expect(responses.length).toBeGreaterThan(0);
      for (const r of responses) {
        const ok = /fallback:\s*'sms'/.test(r) || /ok:\s*true/.test(r);
        expect(ok, `response without sms fallback in ${route}: ${r.slice(0, 60)}`).toBe(true);
      }
    });
    it(`${route} writes nothing to shift_events or the WLES chain`, () => {
      expect(src).not.toMatch(
        /shift_events|generateEventHash|wles_event|insertV1Event|WORKER_EVENT_SIGNING/,
      );
    });
  }

  it('auth-options-open issues a discoverable challenge via the signed cookie', () => {
    const src = read(`${BASE}/auth-options-open/route.ts`);
    expect(src).toMatch(/openAuthOptions/);
    expect(src).toMatch(/setOpenChallengeCookie/);
  });

  it('auth-verify-open mints the worker session only on success and always clears the challenge', () => {
    const src = read(`${BASE}/auth-verify-open/route.ts`);
    expect(src).toMatch(/openAuthVerify/);
    expect(src).toMatch(/setWorkerSessionCookie/);
    expect(src).toMatch(/clearOpenChallengeCookie/);
    // The session is set only inside the verified branch (after the !verified
    // guard). Match the CALL (await …), not the import line.
    const verifiedGuard = src.indexOf('ASSERTION_FAILED');
    const setSessionCall = src.indexOf('await setWorkerSessionCookie');
    expect(verifiedGuard).toBeGreaterThan(0);
    expect(setSessionCall).toBeGreaterThan(verifiedGuard);
  });

  it('logout route clears the worker-session cookie', () => {
    const src = read(`${BASE}/logout/route.ts`);
    expect(src).toMatch(/clearWorkerSessionCookie/);
  });
});
