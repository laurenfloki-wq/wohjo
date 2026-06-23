// Golden evals — bot 52 (daily brief), FLOSMOSIS-calibrated.

import { describe, it, expect } from 'vitest';
import { assembleBrief, priorityActions, needsAttention, type BriefInputs } from './handler';

const base: BriefInputs = {
  cashBalanceCents: 500000,
  mrrCents: 120000,
  newLeads: 3,
  openDeals: 5,
  ciRed: 0,
  pendingApprovals: 0,
};

describe('bot 52 — daily brief (calibrated)', () => {
  it('assembles the FYI sections', () => {
    const s = assembleBrief(base);
    expect(s.map((x) => x.heading)).toEqual(['Money', 'Pipeline', 'Engineering', 'Approvals']);
  });

  it('leads the priority list with the highest business impact', () => {
    const actions = priorityActions({
      ...base,
      runwayMonths: 4,
      revenueLeakageCents: 50000,
      pendingApprovals: 2,
      ciRed: 1,
      churnHighCount: 3,
    });
    expect(actions[0]?.text).toMatch(/Runway/); // runway outranks everything
    expect(actions.map((a) => a.urgency)).toEqual(
      [...actions.map((a) => a.urgency)].sort((x, y) => y - x),
    );
  });

  it('needsAttention is false on a clean day', () => {
    expect(needsAttention(base)).toBe(false);
    expect(priorityActions(base)).toEqual([]);
  });

  it('does not raise runway action when profitable (null runway)', () => {
    const actions = priorityActions({ ...base, runwayMonths: null, pendingApprovals: 1 });
    expect(actions.some((a) => a.text.includes('Runway'))).toBe(false);
    expect(actions[0]?.text).toMatch(/approval/);
  });
});
