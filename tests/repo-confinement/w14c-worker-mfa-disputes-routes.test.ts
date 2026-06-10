// W1.4 slice C repo-confinement guard (2026-06-10).
//
// Worker MFA + dispute routes: identity derives from the verified
// session BEFORE any repository binding; zero raw service-client or
// query-builder use remains in the routes.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTES: Array<{ file: string; auth: string; bindings: string[] }> = [
  {
    file: 'src/app/api/worker/mfa/issue/route.ts',
    auth: 'requireWorkerIdentity(',
    bindings: ['workerSelfRepo(', 'workerMfaChallengesRepo('],
  },
  {
    file: 'src/app/api/worker/mfa/challenge/route.ts',
    auth: 'requireWorkerIdentity(',
    bindings: ['workerSelfRepo(', 'workerMfaChallengesRepo('],
  },
  {
    file: 'src/app/api/worker/disputes/route.ts',
    auth: 'requireWorkerIdentity(',
    bindings: [
      'workerDisputesRepo(identity.workerId, identity.companyId)',
      'shiftEventsMutationRepo(identity.companyId)',
      'disputeChainTail(identity.workerId)',
    ],
  },
  {
    file: 'src/app/api/worker/disputes/new/route.ts',
    auth: 'auth.getUser(',
    bindings: ['workerByAuthUserIdForDisputes(', 'workerDisputesRepo('],
  },
];

describe('W1.4c — worker MFA/dispute route repository confinement', () => {
  for (const r of ROUTES) {
    describe(r.file, () => {
      const source = readFileSync(join(process.cwd(), r.file), 'utf-8');

      it('never touches the raw service client or query builder', () => {
        expect(source).not.toMatch(/createServiceClient/);
        // Table-arg form only — Array.from(...) is legitimate JS.
        expect(source).not.toMatch(/\.from\((['"`])/);
      });

      it('derives identity before binding any repository', () => {
        const auth = source.indexOf(r.auth);
        expect(auth).toBeGreaterThan(-1);
        for (const b of r.bindings) {
          const i = source.indexOf(b);
          expect(i, `expected binding ${b}`).toBeGreaterThan(auth);
        }
      });
    });
  }
});
