// Golden evals — bot 3 (content drafting). Voice validation before publish gate.

import { describe, it, expect } from 'vitest';
import { validateContentDraft } from './handler';

describe('bot 3 — content drafting', () => {
  it('passes clean on-voice copy', () => {
    const v = validateContentDraft('FLOSTRUCTION seals each clock-on as verifiable evidence.');
    expect(v.ok).toBe(true);
    expect(v.issues).toEqual([]);
  });

  it('hard-fails emoji', () => {
    const v = validateContentDraft('Clock on now 🚀');
    expect(v.ok).toBe(false);
    expect(v.issues).toContain('contains emoji');
  });

  it('hard-fails banned hype phrasing', () => {
    const v = validateContentDraft('A revolutionary payroll game-changer.');
    expect(v.ok).toBe(false);
  });
});
