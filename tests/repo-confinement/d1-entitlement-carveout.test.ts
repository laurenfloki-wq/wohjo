import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// D1 / BILL-5 — entitlement-gate confinement (the NEGATIVE test).
//
// The billing gate must sit on NEW billable activity and must NEVER sit on a
// path that reads or exports already-sealed WLES records, pay history, or
// worker exports. A non-paying company AND its workers keep full access to
// their statutory records by law — only new value-extraction is gated.
//
// The verdict logic is unit-tested in entitlement.test.ts. THIS test pins the
// WIRING so the carve-out can't silently regress in either direction:
//   * a billable route losing its gate (revenue leak), or
//   * a records/export route GAINING a gate (locks a non-paying tenant out of
//     its own legal wage records — the exact BILL-5 failure).
//
// Per the work order: a canceled tenant is blocked from new activity
// (entitlement.test.ts proves the 402) but can still read/export sealed
// records — proven here by the guard's provable ABSENCE from those routes.

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const GUARD_TOKENS = ['entitlementGuard', 'assertCompanyEntitled'];
const referencesGuard = (src: string) => GUARD_TOKENS.some((t) => src.includes(t));

// New billable activity — MUST be gated.
const GATED_ROUTES = [
  'src/app/api/command/payruns/run/route.ts',
  'src/app/api/command/shifts/[shiftId]/approve/route.ts',
];

// Reads / exports of already-sealed records, pay history, audit evidence,
// worker exports — MUST NOT be gated (BILL-5 carve-out). Running a NEW pay run
// (payruns/run) is billable and lives in GATED_ROUTES; reading/verifying/
// exporting an EXISTING one is statutory access and lives here.
const CARVE_OUT_ROUTES = [
  'src/app/api/command/audit-trail/route.ts',
  'src/app/api/command/audit/route.ts',
  'src/app/api/command/audit/download/route.ts',
  'src/app/api/command/export/route.ts',
  'src/app/api/command/payruns/[exportId]/evidence/route.ts',
  'src/app/api/command/payruns/[exportId]/payroll/route.ts',
  'src/app/api/command/payruns/verify/route.ts',
  'src/app/api/command/super-evidence/route.ts',
  'src/app/api/exports/myob/route.ts',
  'src/app/api/field/records/route.ts',
  'src/app/api/worker/records/export/route.ts',
];

describe('D1/BILL-5 — entitlement gate is on billable activity only', () => {
  for (const route of GATED_ROUTES) {
    it(`GATES new billable activity: ${route}`, () => {
      expect(referencesGuard(read(route))).toBe(true);
    });
  }
});

describe('D1/BILL-5 — carve-out: sealed-record read/export is never gated', () => {
  for (const route of CARVE_OUT_ROUTES) {
    it(`does NOT gate statutory access: ${route}`, () => {
      // If this fails, a non-paying tenant just lost access to its own legal
      // wage records. That is a launch blocker, not a paywall win.
      expect(referencesGuard(read(route))).toBe(false);
    });
  }
});

describe('D1/BILL-5 — guard helper documents the carve-out contract', () => {
  it('entitlement-guard.ts warns it must not be used on carve-out routes', () => {
    const src = read('src/lib/billing/entitlement-guard.ts');
    expect(src).toMatch(/carve-out|sealed records|pay history/i);
  });
  it('entitlement.ts pins the grace + blocked-status policy', () => {
    const src = read('src/lib/billing/entitlement.ts');
    // grace on past_due; terminal states blocked; null grandfathered.
    expect(src).toMatch(/past_due/);
    expect(src).toMatch(/canceled/);
    expect(src).toMatch(/grandfather/i);
  });
});
