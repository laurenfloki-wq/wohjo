// W1.4 slice B repo-confinement guard (2026-06-10).
//
// Four worker-self field read routes: workerId derives via
// requireWorkerIdentity BEFORE any repository binding; zero raw
// service-client or query-builder use remains in the routes.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTES: Array<{ file: string; bindings: string[] }> = [
  {
    file: 'src/app/api/field/earnings/week/route.ts',
    bindings: ['workerSelfRepo(workerId)', 'workerShiftsSelfRepo(workerId)'],
  },
  {
    file: 'src/app/api/field/home-data/route.ts',
    bindings: ['workerSelfRepo(workerId)', 'workerShiftsSelfRepo(workerId)', 'siteGeoById('],
  },
  {
    file: 'src/app/api/field/records/route.ts',
    bindings: ['workerShiftsSelfRepo(workerId)', 'siteNamesByIds('],
  },
  {
    file: 'src/app/api/field/receipt/[receiptId]/route.ts',
    bindings: [
      'workerShiftsSelfRepo(',
      'workerSelfRepo(sessionWorkerId)',
      'siteNameAddressById(',
      'commitHashForShift(',
      'intelligenceEventForShift(',
    ],
  },
];

describe('W1.4b — field worker-self route repository confinement', () => {
  for (const r of ROUTES) {
    describe(r.file, () => {
      const source = readFileSync(join(process.cwd(), r.file), 'utf-8');

      it('never touches the raw service client or query builder', () => {
        expect(source).not.toMatch(/createServiceClient/);
        // Table-arg form only — Array.from(...) is legitimate JS.
        expect(source).not.toMatch(/\.from\((['"`])/);
      });

      it('derives the worker identity before binding any repository', () => {
        const auth = source.indexOf('requireWorkerIdentity(');
        expect(auth).toBeGreaterThan(-1);
        for (const b of r.bindings) {
          const i = source.indexOf(b);
          expect(i, `expected binding ${b}`).toBeGreaterThan(auth);
        }
      });

      it('never reads worker_id from the query string', () => {
        expect(source).not.toMatch(/searchParams\.get\(['"]worker_id['"]\)/);
      });
    });
  }
});
