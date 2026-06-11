// W1.4 slice F repo-confinement guard (2026-06-10) — admin worker
// import surfaces. Session-auth-first; the bulk RPC's p_company_id
// comes from the repository binding.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FILES = [
  'src/app/api/admin/import/workers/route.ts',
  'src/app/api/admin/workers/bulk-upload/route.ts',
];

describe('W1.4f — admin import route repository confinement', () => {
  for (const file of FILES) {
    describe(file, () => {
      const source = readFileSync(join(process.cwd(), file), 'utf-8');

      it('never touches the raw service client, query builder, or rpc', () => {
        expect(source).not.toMatch(/createServiceClient/);
        expect(source).not.toMatch(/\.from\((['"`])/);
        expect(source).not.toMatch(/supabase\.rpc\(/);
      });

      it('derives company scope before binding the repository', () => {
        const auth = source.indexOf('getCompanyIdForSession(');
        const bind = source.indexOf('workersRepo(companyId)');
        expect(auth).toBeGreaterThan(-1);
        expect(bind).toBeGreaterThan(auth);
      });
    });
  }
});
