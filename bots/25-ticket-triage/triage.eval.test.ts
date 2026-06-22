// Golden evals — bot 25 (ticket triage), FLOSMOSIS-calibrated.

import { describe, it, expect } from 'vitest';
import { triageTicket, type Ticket } from './handler';

const t = (over: Partial<Ticket>): Ticket => ({
  subject: '',
  body: '',
  workerImpactCount: 0,
  ...over,
});

describe('bot 25 — ticket triage (calibrated)', () => {
  it('treats pay/clock-on impact as urgent regardless of headcount', () => {
    const r = triageTicket(t({ subject: 'A worker cannot clock on', workerImpactCount: 1 }));
    expect(r.priority).toBe('urgent');
    expect(r.payImpacting).toBe(true);
    expect(r.queue).toBe('technical');
  });

  it('flags payroll-wrong as urgent + pay-impacting', () => {
    const r = triageTicket(t({ subject: 'payroll wrong this week' }));
    expect(r.priority).toBe('urgent');
    expect(r.payImpacting).toBe(true);
  });

  it('routes billing and scales priority by impact', () => {
    expect(triageTicket(t({ subject: 'wrong invoice charge' })).queue).toBe('billing');
    expect(triageTicket(t({ body: 'general note', workerImpactCount: 5 })).priority).toBe('high');
    expect(triageTicket(t({ body: 'general note', workerImpactCount: 1 })).priority).toBe('normal');
    expect(triageTicket(t({ body: 'fyi' })).priority).toBe('low');
  });
});
