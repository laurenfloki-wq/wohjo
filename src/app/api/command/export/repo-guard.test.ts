// W1.3 repo-confinement guard — /api/command/export (2026-06-10).
//
// Session-auth-first route (no fetch-then-authorize seam): companyId is
// derived via getCompanyIdForSession BEFORE any repository is bound, and
// every DB access goes through a companyId-scoped repository. These
// source-string assertions pin that ordering and keep the raw service
// client out of the route; the schema-drift battery separately audits
// the write payloads at the repo call sites.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(
  join(process.cwd(), 'src/app/api/command/export/route.ts'),
  'utf-8',
);

describe('command/export — repository confinement (W1.3)', () => {
  it('never touches the raw service client or query builder', () => {
    expect(source).not.toMatch(/createServiceClient/);
    // Table-arg form only — Array.from(...) is legitimate JS.
    expect(source).not.toMatch(/\.from\((['"`])/);
  });

  it('derives company scope before binding any repository', () => {
    const auth = source.indexOf('getCompanyIdForSession(');
    const repoBindings = ['exportsRepo(', 'shiftsMutationRepo(', 'shiftEventsMutationRepo(']
      .map((s) => source.indexOf(s))
      .filter((i) => i >= 0);
    expect(auth).toBeGreaterThan(-1);
    expect(repoBindings.length).toBe(3);
    expect(Math.min(...repoBindings)).toBeGreaterThan(auth);
  });

  it('binds all three repositories to the session-derived companyId', () => {
    expect(source).toMatch(/exportsRepo\(companyId\)/);
    expect(source).toMatch(/shiftsMutationRepo\(companyId\)/);
    expect(source).toMatch(/shiftEventsMutationRepo\(companyId\)/);
  });

  it('routes every write through a repository method', () => {
    expect(source).toMatch(/expRepo\.insertExport\(/);
    expect(source).toMatch(/evRepo\.insertV0Event\(/);
    expect(source).toMatch(/repo\.markExported\(/);
  });
});
