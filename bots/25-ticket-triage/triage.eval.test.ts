// Golden evals — bot 25 (ticket triage). Deterministic priority + queue.

import { describe, it, expect } from 'vitest';
import { triageTicket, type Ticket } from './handler';

const t = (over: Partial<Ticket>): Ticket => ({
  subject: '',
  body: '',
  workerImpactCount: 0,
  ...over,
});

describe('bot 25 — ticket triage', () => {
  it('marks outages and wide impact urgent', () => {
    expect(triageTicket(t({ subject: 'App is down' })).priority).toBe('urgent');
    expect(triageTicket(t({ workerImpactCount: 25 })).priority).toBe('urgent');
  });

  it('routes by topic', () => {
    expect(triageTicket(t({ subject: 'Wrong invoice charge' })).queue).toBe('billing');
    expect(triageTicket(t({ body: 'geofence error on the app' })).queue).toBe('technical');
    expect(triageTicket(t({ subject: 'help getting started, first worker' })).queue).toBe(
      'onboarding',
    );
    expect(triageTicket(t({ subject: 'general question' })).queue).toBe('general');
  });

  it('scales priority by worker impact', () => {
    expect(triageTicket(t({ workerImpactCount: 8 })).priority).toBe('high');
    expect(triageTicket(t({ workerImpactCount: 2 })).priority).toBe('normal');
    expect(triageTicket(t({ workerImpactCount: 0 })).priority).toBe('low');
  });
});
