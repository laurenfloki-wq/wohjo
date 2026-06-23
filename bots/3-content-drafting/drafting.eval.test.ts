// Golden evals — bot 3 (content drafting), FLOSMOSIS-calibrated.

import { describe, it, expect } from 'vitest';
import { validateContentDraft } from './handler';

describe('bot 3 — content drafting (calibrated)', () => {
  it('passes clean, on-message copy', () => {
    const v = validateContentDraft(
      'FLOSTRUCTION gives you tamper-evident payroll evidence for every shift.',
    );
    expect(v.ok).toBe(true);
    expect(v.onMessage).toBe(true);
    expect(v.issues).toEqual([]);
  });

  it('flags copy that misses the evidentiary narrative (advisory)', () => {
    const v = validateContentDraft('Our app makes timekeeping easy and fast for your team.');
    expect(v.onMessage).toBe(false);
    expect(v.issues.some((i) => i.includes('off-message'))).toBe(true);
    expect(v.ok).toBe(true); // advisory, not a hard fail
  });

  it('hard-fails emoji and hype regardless of message', () => {
    expect(validateContentDraft('tamper-evident proof 🚀').ok).toBe(false);
    expect(validateContentDraft('a revolutionary game-changer for wage theft').ok).toBe(false);
  });
});
