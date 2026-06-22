import { describe, it, expect } from 'vitest';
import { assembleBrief, needsAttention } from './handler';
const i = {
  cashBalanceCents: 500000,
  mrrCents: 120000,
  newLeads: 3,
  openDeals: 5,
  ciRed: 0,
  pendingApprovals: 0,
};
describe('bot 52 — daily brief', () => {
  it('assembles money/pipeline/engineering/approvals sections', () => {
    const s = assembleBrief(i);
    expect(s.map((x) => x.heading)).toEqual(['Money', 'Pipeline', 'Engineering', 'Approvals']);
    expect(s[0]?.lines[0]).toContain('5000.00');
  });
  it('flags attention on red CI or pending gates', () => {
    expect(needsAttention(i)).toBe(false);
    expect(needsAttention({ ...i, ciRed: 1 })).toBe(true);
    expect(needsAttention({ ...i, pendingApprovals: 2 })).toBe(true);
  });
});
