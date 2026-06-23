// Bot 34 — Bookkeeping (Stripe to Xero).
//
// Trigger: Stripe webhook + daily sweep | Runtime: EF (webhook) + pgmq worker;
// pg_cron sweep | Gate: T1 | Model: Haiku (edge categories only).
//
// Durable + idempotent on the Stripe event id: a redelivered webhook or a
// re-drained pgmq message maps the transaction exactly once. GST is computed
// deterministically (platform/money); the LLM is reserved for genuinely
// ambiguous expense categories and is not on the happy path.

import { gstFromInclusiveCents, netFromInclusiveCents } from '../../platform/money';
import { claimIdempotency, type QueueMessage } from '../../platform/queue';
import { record } from '../../platform/audit';
import { createBankTransaction, type XeroBankTransaction } from '../../platform/connectors/xero';

export const BOT_ID = 'bot-34-bookkeeping';
export const QUEUE = 'bookkeeping';

export interface StripeChargeEvent {
  eventId: string;
  chargeId: string;
  amountCents: number; // gross, GST-inclusive
  feeCents: number;
  currency: string;
  contactName: string;
  description: string;
}

export interface MappedEntry {
  reference: string;
  grossCents: number;
  gstCents: number;
  netCents: number;
  feeCents: number;
  txn: XeroBankTransaction;
}

// Chart-of-accounts codes (FLOSMOSIS). Configurable; defaults documented.
const ACC_SALES = '200';
const ACC_STRIPE_FEES = '404';
const TAX_OUTPUT = 'OUTPUT'; // GST on income
const TAX_EXEMPT = 'EXEMPTEXPENSES';

/**
 * Pure mapping: Stripe charge -> Xero bank transaction with GST split and fee
 * line. Deterministic and fully testable. The Reference carries the Stripe
 * event id so Xero itself dedupes on replay (defence in depth alongside the
 * idempotency claim).
 */
export function mapStripeToXero(ev: StripeChargeEvent): MappedEntry {
  const gstCents = gstFromInclusiveCents(ev.amountCents);
  const netCents = netFromInclusiveCents(ev.amountCents);
  const txn: XeroBankTransaction = {
    Type: 'RECEIVE',
    Contact: { Name: ev.contactName },
    Reference: `stripe:${ev.eventId}`,
    LineItems: [
      {
        Description: ev.description,
        UnitAmount: netCents / 100,
        AccountCode: ACC_SALES,
        TaxType: TAX_OUTPUT,
      },
      {
        Description: 'Stripe processing fee',
        UnitAmount: -(ev.feeCents / 100),
        AccountCode: ACC_STRIPE_FEES,
        TaxType: TAX_EXEMPT,
      },
    ],
  };
  return {
    reference: txn.Reference,
    grossCents: ev.amountCents,
    gstCents,
    netCents,
    feeCents: ev.feeCents,
    txn,
  };
}

/**
 * Durable handler: claim idempotency on the Stripe event id, map, post to Xero,
 * record. Idempotent — a second delivery of the same event id is a no-op.
 */
export async function handle(msg: QueueMessage<StripeChargeEvent>): Promise<void> {
  const ev = msg.message;
  const won = await claimIdempotency(`stripe-event:${ev.eventId}`, BOT_ID);
  if (!won) {
    await record({
      botId: BOT_ID,
      action: 'bookkeeping.skip.duplicate',
      detail: { eventId: ev.eventId },
      idempotencyKey: `stripe-event:${ev.eventId}`,
    });
    return;
  }
  const mapped = mapStripeToXero(ev);
  await createBankTransaction(mapped.txn);
  await record({
    botId: BOT_ID,
    action: 'bookkeeping.posted',
    detail: {
      eventId: ev.eventId,
      reference: mapped.reference,
      grossCents: mapped.grossCents,
      gstCents: mapped.gstCents,
      feeCents: mapped.feeCents,
    },
    idempotencyKey: `stripe-event:${ev.eventId}`,
  });
}
