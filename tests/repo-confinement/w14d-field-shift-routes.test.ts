// W1.4 slice D repo-confinement guard (2026-06-10) — the field
// shift start/end money-path.
//
// start: workerId derives via requireWorkerIdentity BEFORE any
// repository binding; the company binding comes from the worker's OWN
// row. end: fetch-then-authorize — endShiftLookup runs first, the
// cross-worker guard (403) MUST sit between the lookup and every
// repository binding/mutation.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const start = readFileSync(
  join(process.cwd(), 'src/app/api/field/shift/start/route.ts'),
  'utf-8',
);
const end = readFileSync(
  join(process.cwd(), 'src/app/api/field/shift/end/route.ts'),
  'utf-8',
);

describe('W1.4d — field/shift/start confinement', () => {
  it('never touches the raw service client or query builder', () => {
    expect(start).not.toMatch(/createServiceClient/);
    expect(start).not.toMatch(/\.from\((['"`])/);
  });

  it('derives the worker identity before any repository binding', () => {
    const auth = start.indexOf('requireWorkerIdentity(');
    expect(auth).toBeGreaterThan(-1);
    for (const b of [
      'workerSelfRepo(',
      'shiftsMutationRepo(worker.company_id)',
      'shiftEventsMutationRepo(worker.company_id)',
      'runDuplicateStartGuard(',
    ]) {
      expect(start.indexOf(b), `expected ${b}`).toBeGreaterThan(auth);
    }
  });

  it('side-pipe emitters run via the repo wrappers', () => {
    expect(start).toMatch(/emitAuthEventWithServiceClient\(/);
    expect(start).toMatch(/emitGeofenceEventWithServiceClient\(/);
  });
});

describe('W1.4d — field/shift/end confinement (fetch-then-authorize)', () => {
  it('never touches the raw service client or query builder', () => {
    expect(end).not.toMatch(/createServiceClient/);
    expect(end).not.toMatch(/\.from\((['"`])/);
  });

  it('cross-worker guard sits between the lookup and every binding/mutation', () => {
    const lookup = end.indexOf('endShiftLookup(');
    const guard = end.indexOf('shift.worker_id !== sessionWorkerId');
    const bindings = [
      end.indexOf('shiftsMutationRepo(shift.company_id)'),
      end.indexOf('shiftEventsMutationRepo(shift.company_id)'),
      end.indexOf('repo.submitOptimistic('),
      end.indexOf('evRepo.insertV0Event('),
    ];
    expect(lookup).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(lookup);
    for (const b of bindings) {
      expect(b).toBeGreaterThan(guard);
    }
  });

  it('side-pipe emitters run via the repo wrappers', () => {
    expect(end).toMatch(/emitAuthEventWithServiceClient\(/);
    expect(end).toMatch(/emitGeofenceEventWithServiceClient\(/);
  });
});
