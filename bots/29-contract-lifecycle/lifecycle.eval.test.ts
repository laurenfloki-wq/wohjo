// Golden evals — bot 29 (contract lifecycle). Deterministic expiry detection.
import { describe, it, expect } from 'vitest';
import { lifecycleAlerts, type Contract } from './handler';

const c = (over: Partial<Contract> & { id: string }): Contract => ({
  counterparty: 'Acme',
  expiresInDays: 365,
  autoRenews: false,
  noticePeriodDays: 30,
  ...over,
});

describe('bot 29 — contract lifecycle', () => {
  it('flags expired, notice-window, and expiring, most-urgent first', () => {
    const alerts = lifecycleAlerts([
      c({ id: 'far', expiresInDays: 300 }),
      c({ id: 'soon', expiresInDays: 20 }),
      c({ id: 'notice', expiresInDays: 25, autoRenews: true, noticePeriodDays: 30 }),
      c({ id: 'expired', expiresInDays: -5 }),
    ]);
    expect(alerts[0]?.id).toBe('expired');
    expect(alerts.find((a) => a.id === 'notice')?.kind).toBe('notice_window_closing');
    expect(alerts.some((a) => a.id === 'far')).toBe(false);
  });
});
