// W1.4 slice A repo-confinement guard (2026-06-10).
//
// Four session-auth-first command routes (sites, supervisors,
// payroll-mapping, approvals): companyId derives via
// getCompanyIdForSession BEFORE any repository binding; zero raw
// service-client or query-builder use remains in the routes.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTES: Array<{ file: string; bindings: string[] }> = [
  { file: 'src/app/api/command/sites/route.ts', bindings: ['sitesRepo(companyId)'] },
  { file: 'src/app/api/command/supervisors/route.ts', bindings: ['supervisorsRepo(companyId)'] },
  { file: 'src/app/api/command/payroll-mapping/route.ts', bindings: ['tenantActivityMappingsRepo(companyId)'] },
  { file: 'src/app/api/command/approvals/route.ts', bindings: ['shiftsRepo(companyId)', 'supervisorNamesByIds('] },
];

describe('W1.4a — command-route repository confinement', () => {
  for (const r of ROUTES) {
    describe(r.file, () => {
      const source = readFileSync(join(process.cwd(), r.file), 'utf-8');

      it('never touches the raw service client or query builder', () => {
        expect(source).not.toMatch(/createServiceClient/);
        // Table-arg form only — Array.from(...) is legitimate JS.
        expect(source).not.toMatch(/\.from\((['"`])/);
      });

      it('derives company scope before binding any repository', () => {
        const auth = source.indexOf('getCompanyIdForSession(');
        expect(auth).toBeGreaterThan(-1);
        for (const b of r.bindings) {
          const i = source.indexOf(b);
          expect(i, `expected binding ${b}`).toBeGreaterThan(-1);
        }
        const scoped = r.bindings.filter((b) => b.includes('(companyId)'));
        for (const b of scoped) {
          expect(source.indexOf(b)).toBeGreaterThan(auth);
        }
      });
    });
  }
});
