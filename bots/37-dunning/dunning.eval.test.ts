// Golden evals — bot 37 (dunning). Deterministic retry ladder + idempotency key.

import { describe, it, expect } from 'vitest';
import { dunningStep, dunningKey } from './handler';

describe('bot 37 — dunning', () => {
  it('walks the retry ladder', () => {
    expect(dunningStep(1)).toMatchObject({
      delayHours: 24,
      channel: 'email',
      escalateToHuman: false,
    });
    expect(dunningStep(2)).toMatchObject({ delayHours: 72, escalateToHuman: false });
    expect(dunningStep(3)).toMatchObject({ channel: 'email_and_sms', escalateToHuman: false });
  });

  it('escalates to a human beyond the ladder (never duns indefinitely)', () => {
    expect(dunningStep(4).escalateToHuman).toBe(true);
    expect(dunningStep(99).escalateToHuman).toBe(true);
  });

  it('derives a stable idempotency key per invoice + attempt', () => {
    expect(dunningKey('INV-1', 2)).toBe('dunning:INV-1:2');
    expect(dunningKey('INV-1', 2)).toBe(dunningKey('INV-1', 2));
    expect(dunningKey('INV-1', 3)).not.toBe(dunningKey('INV-1', 2));
  });
});
