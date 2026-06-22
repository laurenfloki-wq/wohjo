// Golden evals — bot 14 (reply qualification). Deterministic classify + route.

import { describe, it, expect } from 'vitest';
import { qualifyReply } from './handler';

describe('bot 14 — reply qualification', () => {
  it('suppresses unsubscribe and not-interested', () => {
    expect(qualifyReply('Please remove me from your list').route).toBe('suppress');
    expect(qualifyReply('Not interested, thanks').category).toBe('not_interested');
  });

  it('requeues out-of-office without drafting', () => {
    const r = qualifyReply('I am on annual leave until July');
    expect(r.category).toBe('out_of_office');
    expect(r.shouldDraft).toBe(false);
  });

  it('routes interested to sales and drafts', () => {
    const r = qualifyReply("Sounds good, let's chat");
    expect(r.category).toBe('interested');
    expect(r.route).toBe('sales');
    expect(r.shouldDraft).toBe(true);
  });

  it('prioritises unsubscribe over interest signals', () => {
    expect(qualifyReply('interested but please unsubscribe me').category).toBe('unsubscribe');
  });

  it('routes a bare question to support', () => {
    expect(qualifyReply('How does the geofence work?').route).toBe('support');
  });
});
