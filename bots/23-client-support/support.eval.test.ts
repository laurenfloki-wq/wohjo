// Golden evals — bot 23 (24/7 client support). Escalation + grounding.

import { describe, it, expect } from 'vitest';
import { decideSupportAction, guardAnswer } from './handler';
import { GuardError } from '../../platform/guard';

describe('bot 23 — client support', () => {
  it('answers at T0 when retrieval is strong and topic is general', () => {
    const a = decideSupportAction('how do I install the app', [{ id: 's1', score: 0.9 }]);
    expect(a.kind).toBe('answer');
    expect(a.tier).toBe('T0');
  });

  it('escalates billing/legal to T2', () => {
    const a = decideSupportAction('I want a refund on my invoice', [{ id: 's1', score: 0.95 }]);
    expect(a.kind).toBe('escalate');
    expect(a.tier).toBe('T2');
  });

  it('escalates when retrieval is too weak to ground', () => {
    expect(decideSupportAction('obscure question', []).kind).toBe('escalate');
    expect(decideSupportAction('obscure question', [{ id: 's', score: 0.3 }]).kind).toBe(
      'escalate',
    );
  });

  it('guardAnswer rejects an uncited/hallucinated source', () => {
    expect(() => guardAnswer([{ id: 's1', score: 0.9 }], ['s1'])).not.toThrow();
    expect(() => guardAnswer([{ id: 's1', score: 0.9 }], ['s2'])).toThrow(GuardError);
  });
});
