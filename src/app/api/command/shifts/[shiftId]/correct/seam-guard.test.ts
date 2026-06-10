// Paired-guard test (CP-1 slice 2b, 2026-06-10) — correct
//
// The invariant that makes the unscoped shiftAuthLookup seam safe:
// every lookup is immediately followed by requireCompanyMembership
// before any mutation. This source-string guard stops a future edit
// from using the accessor without the gate — without it the accessor
// is createServiceClient by another name on the money-path table.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(
  join(process.cwd(), 'src/app/api/command/shifts/[shiftId]/correct/route.ts'),
  'utf-8',
);

describe('correct — seam paired-guard', () => {
  it('uses the seam and the membership gate', () => {
    expect(SRC).toMatch(/shiftAuthLookup\(/);
    expect(SRC).toMatch(/requireCompanyMembership\(/);
  });

  it('no direct service client in the route', () => {
    expect(SRC).not.toMatch(/createServiceClient/);
  });

  it('membership gate precedes every mutation', () => {
    const memberIdx = SRC.indexOf('requireCompanyMembership(');
    expect(memberIdx).toBeGreaterThan(-1);
    const lookupIdx = SRC.indexOf('shiftAuthLookup(');
    expect(lookupIdx).toBeGreaterThan(-1);
    expect(memberIdx).toBeGreaterThan(lookupIdx);
    // No raw shifts mutation and no repo mutation call before the gate.
    const pre = SRC.slice(0, memberIdx);
    expect(pre).not.toMatch(/\.from\('shifts'\)\s*\.(update|insert|delete)/);
    expect(pre).not.toMatch(/\.from\('shift_events'\)\s*\.(update|insert|delete)/);
    expect(pre).not.toMatch(/insertV0Event\(|insertCorrectionEvent\(|updateAfterAdjust\(|updateToDisputed\(|approveOptimistic\(/);
  });

  it('parentEventAuthLookup seam is present and the structural guard precedes the insert', () => {
    expect(SRC).toMatch(/parentEventAuthLookup\(/);
    // The accessor itself enforces the company match (discriminated
    // result); the route must consume crossTenant before inserting.
    const parentIdx = SRC.indexOf('parentEventAuthLookup(');
    const crossIdx = SRC.indexOf('crossTenant');
    expect(parentIdx).toBeGreaterThan(-1);
    expect(crossIdx).toBeGreaterThan(parentIdx);
    const insertIdx = SRC.indexOf('insertCorrectionEvent(');
    expect(insertIdx).toBeGreaterThan(crossIdx);
  });
});
