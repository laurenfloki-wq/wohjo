// Workstream 1 — billing email rendering (money formatting is correctness-critical).

import { describe, it, expect } from 'vitest';
import {
  formatAmount,
  renderReceiptEmail,
  renderDunningEmail,
  renderTrialEndingEmail,
  renderUpcomingInvoiceEmail,
  renderDisputeAlertEmail,
} from './billing';

describe('formatAmount', () => {
  it('renders Stripe minor units as major with currency code', () => {
    expect(formatAmount(9900, 'aud')).toBe('$99.00 AUD');
    expect(formatAmount(123456, 'usd')).toBe('$1,234.56 USD');
    expect(formatAmount(0, 'aud')).toBe('$0.00 AUD');
  });
  it('defaults a missing currency to AUD', () => {
    expect(formatAmount(500, '')).toBe('$5.00 AUD');
  });
});

describe('render functions', () => {
  it('receipt shows the paid amount in subject + body', () => {
    const r = renderReceiptEmail({
      to: 'a@b.test',
      amountPaidMinor: 9900,
      currency: 'aud',
      invoiceNumber: 'INV-1',
      hostedInvoiceUrl: 'https://x',
      paidAt: 1750000000,
    });
    expect(r.subject).toContain('$99.00 AUD');
    expect(r.text).toContain('INV-1');
    expect(r.html).toContain('$99.00 AUD');
  });
  it('dunning names the attempt and stays reassuring about records access', () => {
    const r = renderDunningEmail({
      to: 'a@b.test',
      amountDueMinor: 9900,
      currency: 'aud',
      attemptCount: 2,
      nextAttemptAt: 1750100000,
      hostedInvoiceUrl: null,
    });
    expect(r.text).toContain('Attempt: 2');
    expect(r.text.toLowerCase()).toContain('sealed records');
  });
  it('trial-ending greets by company name when present', () => {
    const r = renderTrialEndingEmail({
      to: 'a@b.test',
      companyName: 'Acme',
      trialEndsAt: 1750000000,
    });
    expect(r.text).toContain('Hi Acme,');
    expect(r.subject.toLowerCase()).toContain('trial');
  });
  it('upcoming forecasts the amount', () => {
    const r = renderUpcomingInvoiceEmail({
      to: 'a@b.test',
      amountDueMinor: 9900,
      currency: 'aud',
      nextChargeAt: 1750100000,
    });
    expect(r.subject).toContain('$99.00 AUD');
  });
  it('dispute alert is URGENT and carries the dispute id', () => {
    const r = renderDisputeAlertEmail({
      disputeId: 'dp_1',
      amountMinor: 9900,
      currency: 'aud',
      reason: 'fraudulent',
      evidenceDueBy: 1750200000,
      chargeId: 'ch_1',
    });
    expect(r.subject).toContain('URGENT');
    expect(r.text).toContain('dp_1');
    expect(r.text).toContain('fraudulent');
  });
});
