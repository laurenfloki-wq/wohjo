// W1.4 slice E repo-confinement guard (2026-06-10) — the WOHJO Verify
// supervisor token surface.
//
// The verify_token lookup IS the authentication; approve/dispute are
// fetch-then-authorize: token lookup → shift lookup → site-access
// guard (403) → repository bindings/mutations, in that order.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FILES = {
  auth: 'src/app/api/verify/auth/route.ts',
  shifts: 'src/app/api/verify/shifts/route.ts',
  approve: 'src/app/api/verify/approve/[shiftId]/route.ts',
  dispute: 'src/app/api/verify/dispute/[shiftId]/route.ts',
} as const;
const src = Object.fromEntries(
  Object.entries(FILES).map(([k, f]) => [k, readFileSync(join(process.cwd(), f), 'utf-8')]),
) as Record<keyof typeof FILES, string>;

describe('W1.4e — verify surface repository confinement', () => {
  for (const [name, file] of Object.entries(FILES)) {
    it(`${file} never touches the raw service client or query builder`, () => {
      const s = src[name as keyof typeof FILES];
      expect(s).not.toMatch(/createServiceClient/);
      expect(s).not.toMatch(/\.from\((['"`])/);
    });
  }

  for (const name of ['approve', 'dispute'] as const) {
    it(`${name}: token lookup → shift lookup → site-access guard → bindings, in order`, () => {
      const s = src[name];
      const token = s.indexOf(name === 'approve' ? 'supervisorForApprove(' : 'supervisorForDispute(');
      const lookup = s.indexOf('verifyShiftLookup(');
      const guard = s.indexOf('supervisorSiteIds.includes(shift.site_id)');
      const binds = [
        s.indexOf('shiftsMutationRepo(shift.company_id)'),
        s.indexOf('shiftEventsMutationRepo(shift.company_id)'),
        s.indexOf('evRepo.insertV0Event('),
      ];
      expect(token).toBeGreaterThan(-1);
      expect(lookup).toBeGreaterThan(token);
      expect(guard).toBeGreaterThan(lookup);
      for (const b of binds) expect(b).toBeGreaterThan(guard);
    });
  }
});
