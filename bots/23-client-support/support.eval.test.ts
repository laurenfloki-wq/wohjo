// Golden evals — bot 23 (client support), WLES-grounded.

import { describe, it, expect } from 'vitest';
import { decideSupportAction, guardAnswer } from './handler';
import { GuardError } from '../../platform/guard';

describe('bot 23 — client support (WLES-grounded)', () => {
  it('answers a general question at T0 when retrieval is strong', () => {
    const a = decideSupportAction('how do I install the worker app', [{ id: 's1', score: 0.9 }]);
    expect(a.kind).toBe('answer');
  });

  it('routes an account-specific pay/record question to the sealed-record path', () => {
    const a = decideSupportAction('how many hours did I clock last week', [
      { id: 'kb', score: 0.99 },
    ]);
    expect(a.kind).toBe('evidence'); // never KB recall, even with a confident match
  });

  it('escalates billing/legal to a director', () => {
    expect(
      decideSupportAction('I want a refund on my invoice', [{ id: 's', score: 0.95 }]).kind,
    ).toBe('escalate');
  });

  it('asks a clarifying question on medium confidence', () => {
    const a = decideSupportAction('does it sync', [{ id: 's', score: 0.6 }]);
    expect(a.kind).toBe('clarify');
  });

  it('escalates on weak retrieval rather than guessing', () => {
    expect(decideSupportAction('obscure question', [{ id: 's', score: 0.2 }]).kind).toBe(
      'escalate',
    );
    expect(decideSupportAction('obscure question', []).kind).toBe('escalate');
  });

  it('guardAnswer rejects an uncited/hallucinated source', () => {
    expect(() => guardAnswer([{ id: 's1', score: 0.9 }], ['s1'])).not.toThrow();
    expect(() => guardAnswer([{ id: 's1', score: 0.9 }], ['s2'])).toThrow(GuardError);
  });
});
