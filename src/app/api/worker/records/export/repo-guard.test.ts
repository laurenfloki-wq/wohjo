// W1.3 repo-confinement guard — /api/worker/records/export (2026-06-10).
//
// Identity-derivation ordering: the verified auth user id is resolved
// FIRST (auth.getUser), the worker row is fetched via the unscoped
// workerByAuthUserId accessor (the session user IS the scope — the row
// can only be the caller's own), and every subsequent DB access is
// bound to that worker id. The raw service client stays out of the
// route; the anon session client (createClient) is the only direct
// supabase surface and is auth-only.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(
  join(process.cwd(), 'src/app/api/worker/records/export/route.ts'),
  'utf-8',
);

describe('worker/records/export — repository confinement (W1.3)', () => {
  it('never touches the raw service client or query builder', () => {
    expect(source).not.toMatch(/createServiceClient/);
    // Table-arg form only — Array.from(...) is legitimate JS.
    expect(source).not.toMatch(/\.from\((['"`])/);
  });

  it('derives the worker identity from the verified session, in order', () => {
    const getUser = source.indexOf('auth.getUser(');
    const identity = source.indexOf('workerByAuthUserId(');
    const chain = source.indexOf('recordsChainQuery(');
    const audit = source.indexOf('insertExportRecord(');
    expect(getUser).toBeGreaterThan(-1);
    expect(identity).toBeGreaterThan(getUser);
    expect(chain).toBeGreaterThan(identity);
    expect(audit).toBeGreaterThan(identity);
  });

  it('binds worker-scoped repositories to the session-resolved worker id', () => {
    expect(source).toMatch(/workerByAuthUserId\(userRes\.user\.id\)/);
    expect(source).toMatch(/workerShiftEventsSelfRepo\(worker\.id\)/);
    expect(source).toMatch(/workerRecordExportsRepo\(worker\.id\)/);
  });

  it('keeps the MFA gate on full-history exports', () => {
    expect(source).toMatch(/assertActiveGrant\(log, worker\.id, 'EXPORT_FULL'\)/);
  });
});
