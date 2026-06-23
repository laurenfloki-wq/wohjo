// Golden evals — bot 35 (invoicing). ABN presence + GST + idempotent number.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildInvoice, type InvoiceInput } from './handler';
import { GuardError } from '../../platform/guard';

function input(over: Partial<InvoiceInput> = {}): InvoiceInput {
  return {
    billingEventId: 'bill_1',
    customerName: 'Acme Labour Hire',
    lineDescription: 'FLOSTRUCTION monthly',
    grossCents: 11000,
    ...over,
  };
}

describe('bot 35 — invoicing', () => {
  describe('with ABN configured', () => {
    beforeAll(() => vi.stubEnv('FLOSMOSIS_ABN', '12 345 678 901'));
    afterAll(() => vi.unstubAllEnvs());

    it('attaches the ABN and splits GST', () => {
      const inv = buildInvoice(input());
      expect(inv.abn).toBe('12 345 678 901');
      expect(inv.gstCents).toBe(1000);
      expect(inv.netCents).toBe(10000);
    });

    it('derives a stable invoice number from the billing event (no duplicates)', () => {
      expect(buildInvoice(input({ billingEventId: 'bill_42' })).number).toBe('INV-bill_42');
    });
  });

  it('fails closed when the ABN is not configured', () => {
    vi.stubEnv('FLOSMOSIS_ABN', '');
    try {
      expect(() => buildInvoice(input())).toThrow(GuardError);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
