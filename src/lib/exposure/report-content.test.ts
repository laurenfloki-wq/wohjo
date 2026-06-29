import { describe, it, expect } from 'vitest';
import { orderedGaps } from './report-content';
import type { VectorResult } from './types';

function v(vector: string, band: VectorResult['band'], score: number, applicable = true): VectorResult {
  return {
    vector: vector as VectorResult['vector'],
    label: vector,
    blurb: '',
    band,
    score,
    applicable,
    nextStep: 'step',
    source: { label: 's', url: 'https://x' },
  };
}

describe('orderedGaps (gated prioritised plan)', () => {
  it('returns only flagged, applicable gaps, worst exposure first', () => {
    const result = {
      vectors: [
        v('records', 'exposed', 90),
        v('payday_super', 'watch', 40),
        v('fair_work', 'clear', 10),
        v('licensing', 'na', 0, false),
        v('chain', 'exposed', 95),
      ],
    };
    const ordered = orderedGaps(result);
    expect(ordered.map((g) => g.vector)).toEqual(['chain', 'records', 'payday_super']);
  });

  it('is empty when nothing is flagged', () => {
    expect(orderedGaps({ vectors: [v('records', 'clear', 5)] })).toEqual([]);
  });
});
