// Golden evals — bot 36 (reconciliation). Deterministic three-way match.

import { describe, it, expect } from 'vitest';
import { threeWayMatch } from './handler';

describe('bot 36 — reconciliation', () => {
  it('no breaks when all three sources tie to the cent', () => {
    expect(
      threeWayMatch([
        { reference: 'stripe:evt_1', stripeCents: 11000, xeroCents: 11000, ledgerCents: 11000 },
      ]),
    ).toEqual([]);
  });

  it('flags an amount mismatch', () => {
    const b = threeWayMatch([
      { reference: 'r1', stripeCents: 11000, xeroCents: 10000, ledgerCents: 11000 },
    ]);
    expect(b).toHaveLength(1);
    expect(b[0]?.kind).toBe('amount_mismatch');
  });

  it('flags missing sides', () => {
    const b = threeWayMatch([
      { reference: 'r1', stripeCents: null, xeroCents: 100, ledgerCents: 100 },
      { reference: 'r2', stripeCents: 100, xeroCents: null, ledgerCents: 100 },
      { reference: 'r3', stripeCents: 100, xeroCents: 100, ledgerCents: null },
    ]);
    expect(b.map((x) => x.kind)).toEqual([
      'missing_in_stripe',
      'missing_in_xero',
      'missing_in_ledger',
    ]);
  });
});
