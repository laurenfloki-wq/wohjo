// Golden evals — bot 13 (CRM hygiene). Deterministic, reversible plan.

import { describe, it, expect } from 'vitest';
import { buildHygienePlan, type CrmContact } from './handler';

function c(over: Partial<CrmContact> & { id: string; email: string }): CrmContact {
  return { emailStatus: 'valid', lastActivityDaysAgo: 0, stage: 'lead', ...over };
}

describe('bot 13 — CRM hygiene', () => {
  it('flags duplicates, bounces, and stale contacts', () => {
    const plan = buildHygienePlan([
      c({ id: '1', email: 'a@b.com' }),
      c({ id: '2', email: 'A@B.com' }), // duplicate of 1
      c({ id: '3', email: 'c@d.com', emailStatus: 'hard_bounce' }),
      c({ id: '4', email: 'e@f.com', lastActivityDaysAgo: 200 }),
    ]);
    expect(plan.duplicateIds).toEqual(['2']);
    expect(plan.suppressIds).toEqual(['3']);
    expect(plan.staleIds).toEqual(['4']);
  });

  it('produces an empty plan for a clean list', () => {
    const plan = buildHygienePlan([c({ id: '1', email: 'a@b.com' })]);
    expect(plan).toEqual({ duplicateIds: [], suppressIds: [], staleIds: [] });
  });
});
