// W1.3 repo-confinement guard — /api/exports/myob (2026-06-10).
//
// Both handlers (full pipeline + legacy) derive companyId via
// getCompanyIdForSession BEFORE binding any repository; all DB access
// (reads + the atomic write RPC) flows through scoped repositories.
// tenant_activity_mappings binds tenant_id = companyId structurally.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(
  join(process.cwd(), 'src/app/api/exports/myob/route.ts'),
  'utf-8',
);

describe('exports/myob — repository confinement (W1.3)', () => {
  it('never touches the raw service client or query builder', () => {
    expect(source).not.toMatch(/createServiceClient/);
    // Table-arg form only — Array.from(...) is legitimate JS.
    expect(source).not.toMatch(/\.from\((['"`])/);
    // The RPC must be reached via the repo, never the raw client.
    expect(source).not.toMatch(/supabase\.rpc\(/);
  });

  it('derives company scope before binding any repository (both handlers)', () => {
    const auths = [...source.matchAll(/getCompanyIdForSession\(/g)].map((m) => m.index ?? -1);
    expect(auths.length).toBe(2);
    const bindings = [
      ...source.matchAll(/(?:shiftsRepo|workersRepo|exportsRepo|tenantActivityMappingsRepo)\(companyId\)/g),
    ].map((m) => m.index ?? -1);
    expect(bindings.length).toBeGreaterThanOrEqual(4);
    // Every binding sits after the first auth derivation; the legacy
    // handler's bindings sit after the second.
    expect(Math.min(...bindings)).toBeGreaterThan(auths[0]);
    const legacyBindings = bindings.filter((i) => i > auths[1]);
    expect(legacyBindings.length).toBeGreaterThanOrEqual(2);
  });

  it('routes the atomic write through the exports repo', () => {
    expect(source).toMatch(/expRepo\.processFlostructionExport\(/);
  });
});
