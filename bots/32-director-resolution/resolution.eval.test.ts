// Golden evals — bot 32 (director resolution). Dual-control validation.
import { describe, it, expect } from 'vitest';
import { buildRegisterEntry, DIRECTORS } from './handler';

describe('bot 32 — director resolution', () => {
  it('is valid only with both directors approving', () => {
    const e = buildRegisterEntry({
      title: 'Adopt budget',
      decision: 'Approved',
      date: '2026-06-22',
      approvedBy: [...DIRECTORS],
    });
    expect(e.valid).toBe(true);
    expect(e.problems).toEqual([]);
  });
  it('is invalid with a single director', () => {
    const e = buildRegisterEntry({
      title: 'Adopt budget',
      decision: 'Approved',
      date: '2026-06-22',
      approvedBy: [DIRECTORS[0]],
    });
    expect(e.valid).toBe(false);
    expect(e.problems.some((p) => p.includes(DIRECTORS[1]))).toBe(true);
  });
  it('flags missing fields', () => {
    const e = buildRegisterEntry({ title: '', decision: '', date: '', approvedBy: [] });
    expect(e.problems).toEqual(
      expect.arrayContaining(['missing title', 'missing decision', 'missing date']),
    );
  });
});
