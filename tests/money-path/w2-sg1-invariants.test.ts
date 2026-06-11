// W2 / SG-1 — money-path correctness invariants (2026-06-11).
//
// Cross-cutting pins for the Ship Gate's money-path condition:
//   1. Tenant-predicate hardening: every shifts mutation in the
//      repository carries .eq('company_id', companyId) — the W1
//      deferral, landed here as tracked correctness items.
//   2. Immutable audit: NOTHING in src/ updates, deletes, or upserts
//      shift_events rows — status transitions only, chain append-only
//      (CLAUDE.md rule 6).
//   3. Retry-idempotency: every money-path mutation surface keeps its
//      replay handling.
//   4. Monetary discipline: hour totals are written via toFixed(2)
//      strings, never floats (CLAUDE.md rule 8).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8');
const REPO = read('src/lib/db/repositories/shifts.repo.ts');

describe('W2.1 — tenant-predicate hardening on shifts mutations', () => {
  const METHODS = [
    'updateAfterAdjust',
    'updateToDisputed',
    'approveOptimistic',
    'markExported',
    'submitOptimistic',
    'approveFromVerify',
    'disputeFromVerify',
  ];
  for (const m of METHODS) {
    it(`${m} carries the company_id predicate`, () => {
      const re = new RegExp(
        `${m}:[\\s\\S]*?\\.eq\\(['"]company_id['"],\\s*companyId\\)`,
      );
      const body = REPO.slice(REPO.indexOf(`${m}:`));
      const scoped = body.slice(0, body.indexOf('=>') + 600);
      expect(scoped, `${m} must be tenant-scoped`).toMatch(
        /\.eq\(['"]company_id['"],\s*companyId\)/,
      );
      void re;
    });
  }

  it('the optimistic locks keep their status predicates (hardening added, never replaced)', () => {
    expect(REPO).toMatch(/approveOptimistic[\s\S]*?\.eq\(['"]status['"],\s*['"]SUPERVISOR_APPROVED['"]\)/);
    expect(REPO).toMatch(/submitOptimistic[\s\S]*?\.eq\(['"]status['"],\s*['"]IN_PROGRESS['"]\)/);
    expect(REPO).toMatch(/approveFromVerify[\s\S]*?\.eq\(['"]status['"],\s*['"]SUBMITTED['"]\)/);
    expect(REPO).toMatch(/disputeFromVerify[\s\S]*?\.neq\(['"]status['"],\s*['"]DISPUTED['"]\)/);
  });

  it('disputeShiftLookup is tenant-scoped (PR #81 named candidate, closed)', () => {
    expect(REPO).toMatch(
      /disputeShiftLookup[\s\S]*?\.eq\(['"]company_id['"],\s*companyId\)/,
    );
    const route = read('src/app/api/worker/disputes/route.ts');
    expect(route).toMatch(/disputeShiftLookup\(related_shift_id,\s*identity\.companyId\)/);
  });
});

describe('W2.2 — immutable audit (chain is append-only)', () => {
  it('no src file updates, deletes, or upserts shift_events', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (
          entry.isFile() &&
          full.endsWith('.ts') &&
          !full.endsWith('.test.ts')
        ) {
          const s = fs.readFileSync(full, 'utf-8');
          if (/\.from\(['"]shift_events['"]\)\s*\n?\s*\.(update|delete|upsert)\(/.test(s)) {
            offenders.push(full);
          }
        }
      }
    };
    walk(path.join(process.cwd(), 'src'));
    expect(offenders).toEqual([]);
  });
});

describe('W2.3 — retry-idempotency per money-path mutation', () => {
  it('payroll approve replays as already_approved', () => {
    expect(read('src/app/api/command/shifts/[shiftId]/approve/route.ts')).toMatch(/already_approved/);
  });
  it('shift end treats the unique-index 23505 as idempotent replay', () => {
    const s = read('src/app/api/field/shift/end/route.ts');
    expect(s).toMatch(/uq_shift_events_end_idempotent/);
    expect(s).toMatch(/23505/);
  });
  it('shift start serves retry-storm replays via client_event_id', () => {
    expect(read('src/app/api/field/shift/start/route.ts')).toMatch(/tryRetryReplay/);
  });
  it('myob export replays as already_exported', () => {
    expect(read('src/app/api/exports/myob/route.ts')).toMatch(/already_exported/);
  });
  it('stripe webhook keeps insert-first idempotency', () => {
    const s = read('src/app/api/stripe/webhook/route.ts');
    expect(s).toMatch(/23505|duplicate/i);
  });
});

describe('W2.4 — monetary discipline (decimal strings, never floats)', () => {
  for (const [name, file] of [
    ['adjust', 'src/app/api/command/shifts/[shiftId]/adjust/route.ts'],
    ['shift end', 'src/app/api/field/shift/end/route.ts'],
    ['export', 'src/app/api/command/export/route.ts'],
  ] as const) {
    it(`${name} writes total_hours via toFixed(2)`, () => {
      expect(read(file)).toMatch(/total_hours:\s*\w+\.toFixed\(2\)/);
    });
  }
});

describe('W2.5 — id-keyed write/lookup hardening (slice 2)', () => {
  it('clearPendingSmsApproval is tenant-scoped', () => {
    const s = read('src/lib/db/repositories/supervisors.repo.ts');
    expect(s).toMatch(
      /clearPendingSmsApproval[\s\S]*?\.eq\(['"]company_id['"],\s*companyId\)/,
    );
  });

  it('consumeById is worker-scoped via the factory binding', () => {
    const s = read('src/lib/db/repositories/mfa.repo.ts');
    expect(s).toMatch(/consumeById[\s\S]*?\.eq\(['"]worker_id['"],\s*workerId\)/);
  });

  it('receipt tamper-evidence lookups are worker-scoped', () => {
    expect(REPO).toMatch(/commitHashForShift[\s\S]*?\.eq\(['"]worker_id['"],\s*workerId\)/);
    expect(REPO).toMatch(/intelligenceEventForShift[\s\S]*?\.eq\(['"]worker_id['"],\s*workerId\)/);
    const route = read('src/app/api/field/receipt/[receiptId]/route.ts');
    expect(route).toMatch(/commitHashForShift\(shift\.id,\s*sessionWorkerId\)/);
  });
});
