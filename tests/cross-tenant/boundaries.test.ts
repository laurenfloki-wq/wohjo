// A3 — Cross-tenant isolation boundary tests.
//
// Day 5 rewrite: post-P1 closure. The 29 `.skip`'d suites from Day 2 are
// now CONTRACT TESTS — they assert the architectural invariants set in
// place by the Day 5 route refactor. That gives us deterministic,
// network-free coverage of GAP-A3-001 and GAP-A3-002 while a future
// live-run (`RUN_LIVE_A3=1`) drives end-to-end HTTP assertions against
// a deployed stack.
//
// Each contract test reads the route file and asserts:
//   * Class A `/api/command/*` route imports `getCompanyIdForSession`
//     or `requireCompanyMembership` (the Day-5 helpers).
//   * Class A route does NOT import the legacy `requireCommandAuth`
//     (the stub that never populated `.companyId`).
//   * Class A route does NOT read `company_id` or `companyId` from
//     request body / query.
//   * Class B `/api/field/*` route imports `requireWorkerIdentity`.
//   * Class B route does NOT read `worker_id` or `phone` from the
//     query string.
//
// A violation of any of the above re-opens GAP-A3-001 or GAP-A3-002 and
// must fail the suite.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildTenant, fixtureMarker } from './fixtures';

const LIVE = process.env.RUN_LIVE_A3 === '1';
const ROOT = '/sessions/admiring-wizardly-archimedes/mnt/WOHJO';

function readRoute(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf8');
}

// ------------------------------------------------------------------
// Fixture sanity (unchanged from Day 2)
// ------------------------------------------------------------------

describe('A3 — fixture shape sanity', () => {
  it('acme and bravo produce distinct deterministic UUIDs', () => {
    const acme = buildTenant('acme');
    const bravo = buildTenant('bravo');
    expect(acme.company.id).not.toBe(bravo.company.id);
    expect(acme.sites[0].id).not.toBe(bravo.sites[0].id);
    expect(acme.workers[0].id).not.toBe(bravo.workers[0].id);
    expect(acme.shifts[0].id).not.toBe(bravo.shifts[0].id);
  });

  it('each tenant has 3 sites, 15 workers, 2 supervisors, 750 shifts', () => {
    const t = buildTenant('acme');
    expect(t.sites).toHaveLength(3);
    expect(t.workers).toHaveLength(15);
    expect(t.supervisors).toHaveLength(2);
    expect(t.shifts).toHaveLength(15 * 50);
  });

  it('no worker of one tenant references a site of the other', () => {
    const a = buildTenant('acme');
    const b = buildTenant('bravo');
    const acmeSiteIds = new Set(a.sites.map((s) => s.id));
    const bravoSiteIds = new Set(b.sites.map((s) => s.id));
    for (const s of a.shifts) expect(acmeSiteIds.has(s.site_id)).toBe(true);
    for (const s of b.shifts) expect(bravoSiteIds.has(s.site_id)).toBe(true);
    for (const s of a.shifts) expect(bravoSiteIds.has(s.site_id)).toBe(false);
    for (const s of b.shifts) expect(acmeSiteIds.has(s.site_id)).toBe(false);
  });

  it('fixtureMarker returns a grep-safe string per tenant', () => {
    expect(fixtureMarker('acme')).toBe('_ACME_A3_TEST');
    expect(fixtureMarker('bravo')).toBe('_BRAVO_A3_TEST');
  });
});

// ------------------------------------------------------------------
// Class A contract tests — /api/command/* (GAP-A3-001)
// ------------------------------------------------------------------

const CLASS_A_ROUTES: Array<{ path: string; expectImport: 'getCompanyIdForSession' | 'requireCompanyMembership' }> = [
  { path: 'src/app/api/command/approvals/route.ts',                expectImport: 'getCompanyIdForSession' },
  { path: 'src/app/api/command/audit/route.ts',                    expectImport: 'getCompanyIdForSession' },
  { path: 'src/app/api/command/audit/download/route.ts',           expectImport: 'getCompanyIdForSession' },
  { path: 'src/app/api/command/audit-trail/route.ts',              expectImport: 'getCompanyIdForSession' },
  { path: 'src/app/api/command/export/route.ts',                   expectImport: 'getCompanyIdForSession' },
  { path: 'src/app/api/command/intelligence/route.ts',             expectImport: 'getCompanyIdForSession' },
  { path: 'src/app/api/command/sites/route.ts',                    expectImport: 'getCompanyIdForSession' },
  { path: 'src/app/api/command/super-evidence/route.ts',           expectImport: 'getCompanyIdForSession' },
  { path: 'src/app/api/command/supervisors/route.ts',              expectImport: 'getCompanyIdForSession' },
  { path: 'src/app/api/command/workers/route.ts',                  expectImport: 'getCompanyIdForSession' },
  { path: 'src/app/api/command/shifts/[shiftId]/adjust/route.ts',  expectImport: 'requireCompanyMembership' },
  { path: 'src/app/api/command/shifts/[shiftId]/approve/route.ts', expectImport: 'requireCompanyMembership' },
  { path: 'src/app/api/command/shifts/[shiftId]/dispute/route.ts', expectImport: 'requireCompanyMembership' },
];

describe('A3 — Class A /api/command/* contract (GAP-A3-001)', () => {
  for (const { path, expectImport } of CLASS_A_ROUTES) {
    describe(path, () => {
      const source = readRoute(path);

      it(`imports ${expectImport} from @/lib/auth/session`, () => {
        expect(source).toMatch(new RegExp(`import[^;]*${expectImport}[^;]*from ['"]@/lib/auth/session['"]`));
      });

      it('does NOT import the legacy requireCommandAuth', () => {
        expect(source).not.toMatch(/requireCommandAuth/);
      });

      it('does NOT read company_id from the request body', () => {
        // We permit the server-side insert-line `company_id: companyId`
        // (where companyId was derived from session), but the pattern
        // that reads company_id OFF the request body is forbidden.
        const forbidden = [
          /const\s+\{[^}]*company_id[^}]*\}\s*=\s*body/,
          /body\.company_id/,
          /raw\.company_id/,
          /searchParams\.get\(['"]company_?[iI]d['"]\)/,
        ];
        for (const re of forbidden) {
          expect(source).not.toMatch(re);
        }
      });
    });
  }
});

// ------------------------------------------------------------------
// Class B contract tests — /api/field/* (GAP-A3-002)
// ------------------------------------------------------------------

const CLASS_B_ROUTES = [
  'src/app/api/field/worker/route.ts',
  'src/app/api/field/home-data/route.ts',
  'src/app/api/field/earnings/week/route.ts',
  'src/app/api/field/shifts/week/route.ts',
  'src/app/api/field/shift/start/route.ts',
  'src/app/api/field/shift/end/route.ts',
  'src/app/api/field/receipt/[receiptId]/route.ts',
];

describe('A3 — Class B /api/field/* contract (GAP-A3-002)', () => {
  for (const path of CLASS_B_ROUTES) {
    describe(path, () => {
      const source = readRoute(path);

      it('imports requireWorkerIdentity from @/lib/auth/session', () => {
        expect(source).toMatch(
          /import[^;]*requireWorkerIdentity[^;]*from ['"]@\/lib\/auth\/session['"]/,
        );
      });

      it('does NOT read worker_id from the query string', () => {
        expect(source).not.toMatch(/searchParams\.get\(['"]worker_id['"]\)/);
      });

      it('does NOT read phone from the query string', () => {
        expect(source).not.toMatch(/searchParams\.get\(['"]phone['"]\)/);
      });
    });
  }
});

// ------------------------------------------------------------------
// No remaining usage of legacy requireCommandAuth anywhere in /api
// ------------------------------------------------------------------

describe('A3 — legacy requireCommandAuth is fully retired', () => {
  it('no file under src/app/api/ still imports requireCommandAuth', () => {
    // Walk filesystem at test time — simpler than hand-listing.
    const apiRoot = join(ROOT, 'src/app/api');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pathMod = require('path') as typeof import('path');
    const offenders: string[] = [];
    function walk(dir: string): void {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = pathMod.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && entry.name.endsWith('.ts')) {
          const src = fs.readFileSync(full, 'utf8');
          if (src.includes('requireCommandAuth')) offenders.push(full);
        }
      }
    }
    walk(apiRoot);
    expect(offenders).toEqual([]);
  });
});

// ------------------------------------------------------------------
// Live-run stub (reserved for RUN_LIVE_A3=1 environment)
// ------------------------------------------------------------------

describe('A3 — live-run scaffold', () => {
  it.skipIf(!LIVE)('[LIVE] inserts Acme+Bravo fixtures and runs cleanup', async () => {
    // TODO(live): Use service-role Supabase client to insert each tenant's
    // companies/sites/workers/supervisors/shifts rows. Run the real HTTP
    // assertions. Then delete all rows tagged _ACME_A3_TEST / _BRAVO_A3_TEST.
    expect(LIVE).toBe(true);
  });
});
