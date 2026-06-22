// Golden evals — bot 22 (feedback/NPS). Deterministic NPS.

import { describe, it, expect } from 'vitest';
import { computeNps } from './handler';

const r = (score: number) => ({ score, comment: '' });

describe('bot 22 — feedback/NPS', () => {
  it('classifies promoters, passives, detractors', () => {
    const res = computeNps([r(10), r(9), r(8), r(7), r(6), r(0)]);
    expect(res.promoters).toBe(2);
    expect(res.passives).toBe(2);
    expect(res.detractors).toBe(2);
  });

  it('computes NPS as %promoters - %detractors', () => {
    // 2 promoters, 2 detractors, total 6 -> (2-2)/6 = 0
    expect(computeNps([r(10), r(9), r(8), r(7), r(3), r(2)]).nps).toBe(0);
    // 3 promoters of 4, 1 detractor -> (3-1)/4 = 50
    expect(computeNps([r(10), r(10), r(9), r(2)]).nps).toBe(50);
  });

  it('returns 0 for no responses', () => {
    expect(computeNps([]).nps).toBe(0);
  });
});
