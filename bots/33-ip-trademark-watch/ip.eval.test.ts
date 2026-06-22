// Golden evals — bot 33 (IP & trademark watch). Similarity screen.
import { describe, it, expect } from 'vitest';
import { similarity, flagHits } from './handler';

describe('bot 33 — IP & trademark watch', () => {
  it('scores identical marks 1 and dissimilar low', () => {
    expect(similarity('FLOSMOSIS', 'flosmosis')).toBe(1);
    expect(similarity('flosmosis', 'bunnings')).toBeLessThan(0.3);
  });
  it('flags near-identical marks with source, strongest first', () => {
    const flagged = flagHits([
      { mark: 'Flosmosis', applicant: 'X', sourceUrl: 'u1' },
      { mark: 'Flostruktion', applicant: 'Y', sourceUrl: 'u2' },
      { mark: 'Totally Different', applicant: 'Z', sourceUrl: 'u3' },
    ]);
    expect(flagged[0]?.collidesWith).toBe('flosmosis');
    expect(flagged.some((f) => f.mark === 'Totally Different')).toBe(false);
  });
});
