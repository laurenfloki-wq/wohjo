// Golden evals — bot 27 (contract drafting). Canonical templates only.
import { describe, it, expect } from 'vitest';
import { reviewDraft } from './handler';

describe('bot 27 — contract drafting', () => {
  it('passes a complete canonical NDA', () => {
    const r = reviewDraft('nda', ['parties', 'confidential_info', 'term', 'governing_law']);
    expect(r.requiresEscalation).toBe(false);
    expect(r.missingClauses).toEqual([]);
  });
  it('flags a missing canonical clause', () => {
    const r = reviewDraft('nda', ['parties', 'confidential_info', 'term']);
    expect(r.missingClauses).toContain('governing_law');
    expect(r.requiresEscalation).toBe(true);
  });
  it('flags a non-standard (extra) clause', () => {
    const r = reviewDraft('nda', [
      'parties',
      'confidential_info',
      'term',
      'governing_law',
      'penalty',
    ]);
    expect(r.nonStandardClauses).toEqual(['penalty']);
    expect(r.requiresEscalation).toBe(true);
  });
});
