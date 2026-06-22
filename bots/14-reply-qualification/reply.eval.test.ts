// Golden evals — bot 14 (reply qualification), FLOSMOSIS-calibrated.

import { describe, it, expect } from 'vitest';
import { qualifyReply } from './handler';

describe('bot 14 — reply qualification (calibrated)', () => {
  it('detects a buying signal and routes hot to sales even without "interested"', () => {
    const r = qualifyReply('How much is it per worker for about 80 workers across 3 sites?');
    expect(r.category).toBe('interested');
    expect(r.route).toBe('sales');
    expect(r.buyingSignal).toBe(true);
    expect(r.priority).toBe('high');
    expect(r.shouldDraft).toBe(true);
  });

  it('suppresses unsubscribe and not-interested', () => {
    expect(qualifyReply('please take me off your list').route).toBe('suppress');
    expect(qualifyReply('we already have a system, not a fit').category).toBe('not_interested');
  });

  it('requeues out-of-office without drafting', () => {
    const r = qualifyReply('I am on site until Monday');
    expect(r.category).toBe('out_of_office');
    expect(r.shouldDraft).toBe(false);
  });

  it('prioritises unsubscribe over a buying signal', () => {
    expect(qualifyReply('interested in pricing but unsubscribe me first').category).toBe(
      'unsubscribe',
    );
  });

  it('routes a plain question to support', () => {
    expect(qualifyReply('does it work offline on remote sites?').route).toBe('support');
  });
});
