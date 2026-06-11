import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// W6(b) -- admin TOTP MFA guard pins.
//
// (1) Confinement: the four MFA routes touch no Supabase client of any
//     kind -- all persistence lives in src/lib/auth/admin-mfa.ts.
// (2) Bootstrap: each MFA route resolves membership with skipMfaCheck
//     so an unverified admin can still enrol/verify (no deadlock).
// (3) Chokepoint ordering in session.ts: admins-row resolution happens
//     BEFORE the MFA assert, and the assert runs unless skipMfaCheck.
// (4) Graduated semantics in admin-mfa.ts: not-enrolled allows with the
//     warn-log; confirmed-without-grant throws 403 MFA_REQUIRED; the
//     replay guard is an optimistic last_used_step update.

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const MFA_ROUTES = [
  'src/app/api/command/mfa/status/route.ts',
  'src/app/api/command/mfa/enroll/route.ts',
  'src/app/api/command/mfa/confirm/route.ts',
  'src/app/api/command/mfa/verify/route.ts',
];

describe('w14h -- admin MFA route confinement', () => {
  for (const route of MFA_ROUTES) {
    it(`${route} holds zero Supabase client access and uses skipMfaCheck`, () => {
      const src = read(route);
      expect(src.includes('createServiceClient')).toBe(false);
      expect(/from ['"]@supabase\/supabase-js['"]/.test(src)).toBe(false);
      expect(/\.from\((['"`])/.test(src)).toBe(false);
      expect(src).toMatch(/getCompanyIdForSession\(log, \{ skipMfaCheck: true \}\)/);
    });
  }

  it('code-accepting routes are durably rate-limited before verification', () => {
    for (const route of ['confirm', 'verify'] as const) {
      const src = read(`src/app/api/command/mfa/${route}/route.ts`);
      expect(src).toMatch(/checkRateLimitDurable\(`admin-mfa-/);
      const rlIdx = src.indexOf('checkRateLimitDurable');
      const fnIdx = src.search(/confirmEnrolment\(log|verifyAdminMfa\(log/);
      expect(rlIdx).toBeGreaterThan(-1);
      expect(fnIdx).toBeGreaterThan(rlIdx);
    }
  });
});

describe('w14h -- chokepoint ordering in session.ts', () => {
  const src = read('src/lib/auth/session.ts');

  it('membership resolution precedes the MFA assert', () => {
    const adminsLookup = src.indexOf(".from('admins')");
    const mfaAssert = src.indexOf('assertAdminMfaSatisfied(log, row.user_id)');
    expect(adminsLookup).toBeGreaterThan(-1);
    expect(mfaAssert).toBeGreaterThan(adminsLookup);
  });

  it('the assert is guarded only by skipMfaCheck', () => {
    expect(src).toMatch(/if \(!opts\.skipMfaCheck\) \{\s*\n\s*await assertAdminMfaSatisfied\(log, row\.user_id\);/);
  });
});

describe('w14h -- graduated semantics in admin-mfa.ts', () => {
  const src = read('src/lib/auth/admin-mfa.ts');

  it('not-enrolled admins pass with the warn-log (no founder lockout)', () => {
    const block = src.slice(src.indexOf('export async function assertAdminMfaSatisfied'));
    expect(block).toMatch(/'admin\.mfa\.not_enrolled'\);\s*\n\s*return;/);
  });

  it('confirmed-without-grant throws 403 MFA_REQUIRED', () => {
    expect(src).toMatch(/403,\s*\n?\s*'MFA_REQUIRED'/);
  });

  it('replay guard: optimistic last_used_step consume', () => {
    expect(src).toMatch(/\.eq\('last_used_step', fromStep\)/);
    expect(src).toMatch(/'MFA_REPLAY'/);
  });

  it('enrolment never returns a confirmed secret a second time', () => {
    expect(src).toMatch(/MFA_ALREADY_ENROLLED/);
  });
});
