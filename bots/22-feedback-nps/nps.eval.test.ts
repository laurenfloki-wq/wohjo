// Golden evals — bot 22 (feedback/NPS), FLOSMOSIS-calibrated.

import { describe, it, expect } from 'vitest';
import { computeNps, npsPlay } from './handler';

const r = (score: number) => ({ score, comment: '' });

describe('bot 22 — feedback/NPS (calibrated)', () => {
  it('classifies and computes NPS', () => {
    expect(computeNps([r(10), r(10), r(9), r(2)]).nps).toBe(50);
    expect(computeNps([]).nps).toBe(0);
  });

  it('maps each response to a follow-up play', () => {
    expect(npsPlay(10)).toBe('referral_and_case_study');
    expect(npsPlay(9)).toBe('referral_and_case_study');
    expect(npsPlay(8)).toBe('nurture_to_promoter');
    expect(npsPlay(6)).toBe('save_play');
    expect(npsPlay(0)).toBe('save_play');
  });
});
