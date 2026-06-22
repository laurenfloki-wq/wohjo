// Bot 35 — Invoicing.
//
// Trigger: billing webhook | Runtime: EF + pgmq | Gate: T0 | Model: none.
//
// Issues an invoice, attaches the FLOSMOSIS ABN, archives. No duplicate invoice:
// idempotent on the billing event id. ABN presence is a hard structural check
// (Spam Act / tax-invoice requirements) before the invoice is considered valid.

import { netFromInclusiveCents, gstFromInclusiveCents } from '../../platform/money';
import { GuardError } from '../../platform/guard';
import { env } from '../../platform/env';

export const BOT_ID = 'bot-35-invoicing';
export const QUEUE = 'invoicing';

export interface InvoiceInput {
  billingEventId: string;
  customerName: string;
  lineDescription: string;
  grossCents: number;
}

export interface TaxInvoice {
  number: string;
  abn: string;
  customerName: string;
  lineDescription: string;
  grossCents: number;
  netCents: number;
  gstCents: number;
}

/**
 * Build a compliant tax invoice. Throws GuardError('ABN_NOT_CONFIGURED') if the
 * ABN is missing — an Australian tax invoice over the threshold must show the
 * supplier ABN, so we fail closed.
 */
export function buildInvoice(input: InvoiceInput): TaxInvoice {
  const abn = env('FLOSMOSIS_ABN');
  if (!abn) {
    throw new GuardError('ABN_NOT_CONFIGURED', 'Cannot issue a tax invoice without FLOSMOSIS_ABN.');
  }
  return {
    number: `INV-${input.billingEventId}`,
    abn,
    customerName: input.customerName,
    lineDescription: input.lineDescription,
    grossCents: input.grossCents,
    netCents: netFromInclusiveCents(input.grossCents),
    gstCents: gstFromInclusiveCents(input.grossCents),
  };
}
