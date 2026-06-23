// Golden evals — bot 34 (bookkeeping). Pure mapping + GST correctness.

import { describe, it, expect } from 'vitest';
import { mapStripeToXero, type StripeChargeEvent } from './handler';

function ev(over: Partial<StripeChargeEvent> = {}): StripeChargeEvent {
  return {
    eventId: 'evt_123',
    chargeId: 'ch_123',
    amountCents: 11000, // $110.00 GST-inclusive
    feeCents: 320,
    currency: 'aud',
    contactName: 'Acme Labour Hire',
    description: 'FLOSTRUCTION subscription',
    ...over,
  };
}

describe('bot 34 — bookkeeping', () => {
  it('splits GST correctly on a GST-inclusive amount', () => {
    const m = mapStripeToXero(ev());
    // $110 inc GST -> $10 GST, $100 net
    expect(m.gstCents).toBe(1000);
    expect(m.netCents).toBe(10000);
  });

  it('carries the Stripe event id as the Xero Reference (replay-safe)', () => {
    const m = mapStripeToXero(ev({ eventId: 'evt_xyz' }));
    expect(m.reference).toBe('stripe:evt_xyz');
    expect(m.txn.Reference).toBe('stripe:evt_xyz');
  });

  it('records the fee as a negative line', () => {
    const m = mapStripeToXero(ev({ feeCents: 320 }));
    const feeLine = m.txn.LineItems.find((l) => l.Description.includes('fee'));
    expect(feeLine?.UnitAmount).toBeCloseTo(-3.2, 6);
  });

  it('net + gst equals gross (no cents lost)', () => {
    const m = mapStripeToXero(ev({ amountCents: 9999 }));
    expect(m.netCents + m.gstCents).toBe(9999);
  });
});
