// Workstream 1 — Stripe billing lifecycle customer-comms emails.
//
// Behavioural tests for the five email side-effect handlers. Per handler:
//   (a) DB state unchanged (no companies/log mutation from the email path)
//   (b) the correct email is invoked with the correct payload
//   (c) an email-provider failure still returns ok:true (non-fatal)
// Plus an idempotency assertion: the handlers carry NO dedup of their own —
// the webhook route is the single dedup authority (stripe_event_log PK), so a
// processed replay never re-dispatches and therefore never double-sends.
//
// The email module and the Next-route import are mocked so the handler
// registry can be imported and invoked directly.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('@/lib/email/billing', () => ({
  sendTrialEndingEmail: vi.fn(async () => undefined),
  sendReceiptEmail: vi.fn(async () => undefined),
  sendDunningEmail: vi.fn(async () => undefined),
  sendUpcomingInvoiceEmail: vi.fn(async () => undefined),
  sendDisputeAlertEmail: vi.fn(async () => undefined),
}));
// Neutralise the Next server-route import chain pulled in transitively.
vi.mock('@/app/api/stripe/checkout/route', () => ({
  verifyClientReference: vi.fn(),
}));
vi.mock('@/lib/email/welcome', () => ({ sendWelcomeEmail: vi.fn(async () => undefined) }));

import * as billing from '@/lib/email/billing';
import { STRIPE_HANDLERS, type StripeEvent } from './webhook-handlers';

function makeLog() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;
}

/** Supabase stub: a configurable maybeSingle read + mutation spies that must
 *  never fire from the email path. */
function makeSupabase(readData: Record<string, unknown> | null = null) {
  const update = vi.fn();
  const insert = vi.fn();
  const del = vi.fn();
  const upsert = vi.fn();
  const from = vi.fn((_t: string) => ({
    select: (_c: string) => ({
      eq: (_k: string, _v: string) => ({
        maybeSingle: async () => ({ data: readData, error: null }),
      }),
    }),
    update,
    insert,
    delete: del,
    upsert,
  }));
  return { client: { from } as any, spies: { from, update, insert, del, upsert } };
}

function evt(type: string, object: Record<string, unknown>): StripeEvent {
  return { id: `evt_${type}`, type, created: 1, livemode: false, data: { object } };
}

beforeEach(() => vi.clearAllMocks());

// ── 1. trial_will_end ────────────────────────────────────────────────────────
describe('onTrialWillEnd', () => {
  const handler = STRIPE_HANDLERS['customer.subscription.trial_will_end'];
  const event = evt('customer.subscription.trial_will_end', {
    id: 'sub_1',
    customer: 'cus_1',
    trial_end: 1750000000,
  });

  it('(b) sends the trial-ending email to the resolved billing contact', async () => {
    const sb = makeSupabase({ name: 'Acme', billing_contact_email: 'owner@acme.test' });
    const res = await handler(event, { log: makeLog(), supabase: sb.client });
    expect(res.ok).toBe(true);
    expect(billing.sendTrialEndingEmail).toHaveBeenCalledTimes(1);
    expect(billing.sendTrialEndingEmail).toHaveBeenCalledWith({
      to: 'owner@acme.test',
      companyName: 'Acme',
      trialEndsAt: 1750000000,
    });
  });

  it('(a) makes no DB mutation', async () => {
    const sb = makeSupabase({ name: 'Acme', billing_contact_email: 'owner@acme.test' });
    await handler(event, { log: makeLog(), supabase: sb.client });
    expect(sb.spies.update).not.toHaveBeenCalled();
    expect(sb.spies.insert).not.toHaveBeenCalled();
    expect(sb.spies.del).not.toHaveBeenCalled();
  });

  it('no billing email on file → ok:true, no send', async () => {
    const sb = makeSupabase({ name: 'Acme', billing_contact_email: null });
    const res = await handler(event, { log: makeLog(), supabase: sb.client });
    expect(res.ok).toBe(true);
    expect(billing.sendTrialEndingEmail).not.toHaveBeenCalled();
  });

  it('(c) email failure → still ok:true, logged at error', async () => {
    (billing.sendTrialEndingEmail as any).mockRejectedValueOnce(new Error('resend down'));
    const sb = makeSupabase({ name: 'Acme', billing_contact_email: 'owner@acme.test' });
    const log = makeLog();
    const res = await handler(event, { log, supabase: sb.client });
    expect(res.ok).toBe(true);
    expect(log.error).toHaveBeenCalled();
  });
});

// ── 2. invoice.paid ──────────────────────────────────────────────────────────
describe('onInvoicePaid', () => {
  const handler = STRIPE_HANDLERS['invoice.paid'];
  const event = evt('invoice.paid', {
    id: 'in_1',
    customer_email: 'owner@acme.test',
    amount_paid: 9900,
    currency: 'aud',
    number: 'INV-1',
    hosted_invoice_url: 'https://pay.stripe.test/in_1',
    status_transitions: { paid_at: 1750000000 },
  });

  it('(b) sends the receipt with the correct payload', async () => {
    const sb = makeSupabase();
    const res = await handler(event, { log: makeLog(), supabase: sb.client });
    expect(res.ok).toBe(true);
    expect(billing.sendReceiptEmail).toHaveBeenCalledTimes(1);
    expect(billing.sendReceiptEmail).toHaveBeenCalledWith({
      to: 'owner@acme.test',
      amountPaidMinor: 9900,
      currency: 'aud',
      invoiceNumber: 'INV-1',
      hostedInvoiceUrl: 'https://pay.stripe.test/in_1',
      paidAt: 1750000000,
    });
  });

  it('(a) makes no DB mutation', async () => {
    const sb = makeSupabase();
    await handler(event, { log: makeLog(), supabase: sb.client });
    expect(sb.spies.update).not.toHaveBeenCalled();
    expect(sb.spies.insert).not.toHaveBeenCalled();
  });

  it('(c) email failure → still ok:true', async () => {
    (billing.sendReceiptEmail as any).mockRejectedValueOnce(new Error('resend down'));
    const log = makeLog();
    const res = await handler(event, { log, supabase: makeSupabase().client });
    expect(res.ok).toBe(true);
    expect(log.error).toHaveBeenCalled();
  });
});

// ── 3. invoice.payment_failed ────────────────────────────────────────────────
describe('onInvoicePaymentFailed', () => {
  const handler = STRIPE_HANDLERS['invoice.payment_failed'];
  const event = evt('invoice.payment_failed', {
    id: 'in_2',
    customer_email: 'owner@acme.test',
    amount_due: 9900,
    currency: 'aud',
    attempt_count: 2,
    next_payment_attempt: 1750100000,
    hosted_invoice_url: 'https://pay.stripe.test/in_2',
  });

  it('(b) sends the dunning email with attempt + next-attempt', async () => {
    const res = await handler(event, { log: makeLog(), supabase: makeSupabase().client });
    expect(res.ok).toBe(true);
    expect(billing.sendDunningEmail).toHaveBeenCalledWith({
      to: 'owner@acme.test',
      amountDueMinor: 9900,
      currency: 'aud',
      attemptCount: 2,
      nextAttemptAt: 1750100000,
      hostedInvoiceUrl: 'https://pay.stripe.test/in_2',
    });
  });

  it('(a) makes no DB mutation (suspension is Stripe-driven, no parallel counter)', async () => {
    const sb = makeSupabase();
    await handler(event, { log: makeLog(), supabase: sb.client });
    expect(sb.spies.update).not.toHaveBeenCalled();
    expect(sb.spies.insert).not.toHaveBeenCalled();
  });

  it('(c) email failure → still ok:true', async () => {
    (billing.sendDunningEmail as any).mockRejectedValueOnce(new Error('resend down'));
    const log = makeLog();
    const res = await handler(event, { log, supabase: makeSupabase().client });
    expect(res.ok).toBe(true);
    expect(log.error).toHaveBeenCalled();
  });
});

// ── 4. invoice.upcoming ──────────────────────────────────────────────────────
describe('onInvoiceUpcoming', () => {
  const handler = STRIPE_HANDLERS['invoice.upcoming'];
  const event = evt('invoice.upcoming', {
    customer_email: 'owner@acme.test',
    amount_due: 9900,
    currency: 'aud',
    next_payment_attempt: 1750100000,
  });

  it('(b) sends the forecast email', async () => {
    const res = await handler(event, { log: makeLog(), supabase: makeSupabase().client });
    expect(res.ok).toBe(true);
    expect(billing.sendUpcomingInvoiceEmail).toHaveBeenCalledWith({
      to: 'owner@acme.test',
      amountDueMinor: 9900,
      currency: 'aud',
      nextChargeAt: 1750100000,
    });
  });

  it('(a) makes no DB mutation', async () => {
    const sb = makeSupabase();
    await handler(event, { log: makeLog(), supabase: sb.client });
    expect(sb.spies.update).not.toHaveBeenCalled();
  });

  it('(c) email failure → still ok:true', async () => {
    (billing.sendUpcomingInvoiceEmail as any).mockRejectedValueOnce(new Error('resend down'));
    const log = makeLog();
    const res = await handler(event, { log, supabase: makeSupabase().client });
    expect(res.ok).toBe(true);
    expect(log.error).toHaveBeenCalled();
  });
});

// ── 5. charge.dispute.created ────────────────────────────────────────────────
describe('onChargeDisputeCreated', () => {
  const handler = STRIPE_HANDLERS['charge.dispute.created'];
  const event = evt('charge.dispute.created', {
    id: 'dp_1',
    amount: 9900,
    currency: 'aud',
    reason: 'fraudulent',
    evidence_details: { due_by: 1750200000 },
    charge: 'ch_1',
  });

  it('(b) sends the founder dispute alert', async () => {
    const res = await handler(event, { log: makeLog(), supabase: makeSupabase().client });
    expect(res.ok).toBe(true);
    expect(billing.sendDisputeAlertEmail).toHaveBeenCalledWith({
      disputeId: 'dp_1',
      amountMinor: 9900,
      currency: 'aud',
      reason: 'fraudulent',
      evidenceDueBy: 1750200000,
      chargeId: 'ch_1',
    });
  });

  it('(a) makes no DB mutation (no auto-suspend; founder-led)', async () => {
    const sb = makeSupabase();
    await handler(event, { log: makeLog(), supabase: sb.client });
    expect(sb.spies.update).not.toHaveBeenCalled();
    expect(sb.spies.insert).not.toHaveBeenCalled();
  });

  it('(c) email failure → still ok:true', async () => {
    (billing.sendDisputeAlertEmail as any).mockRejectedValueOnce(new Error('resend down'));
    const log = makeLog();
    const res = await handler(event, { log, supabase: makeSupabase().client });
    expect(res.ok).toBe(true);
    expect(log.error).toHaveBeenCalled();
  });
});

// ── Idempotency: route is the single dedup authority ─────────────────────────
describe('idempotency — replays do not double-send', () => {
  const routeSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/app/api/stripe/webhook/route.ts'),
    'utf-8',
  );

  const billingHandlers = [
    'customer.subscription.trial_will_end',
    'invoice.paid',
    'invoice.payment_failed',
    'invoice.upcoming',
    'charge.dispute.created',
  ];

  it('none of the 5 billing handlers dedup themselves (never query stripe_event_log)', async () => {
    for (const type of billingHandlers) {
      const sb = makeSupabase({ name: 'Acme', billing_contact_email: 'owner@acme.test' });
      await STRIPE_HANDLERS[type](
        evt(type, {
          id: 'x',
          customer: 'cus_1',
          customer_email: 'owner@acme.test',
          amount_paid: 100,
          amount_due: 100,
          currency: 'aud',
          attempt_count: 1,
          trial_end: 1,
        }),
        { log: makeLog(), supabase: sb.client },
      );
      const tables = sb.spies.from.mock.calls.map((c) => c[0]);
      expect(tables, `${type} must not touch stripe_event_log`).not.toContain('stripe_event_log');
    }
  });

  it('the webhook route owns dedup via stripe_event_log + idempotent-replay short-circuit', () => {
    expect(routeSrc).toMatch(/stripe_event_log/);
    expect(routeSrc).toMatch(/idempotent_replay|idempotent:\s*true/);
  });

  it('each handler sends exactly once per invocation (so N route-dispatches → N emails)', async () => {
    const sb = makeSupabase({ name: 'Acme', billing_contact_email: 'owner@acme.test' });
    await STRIPE_HANDLERS['invoice.paid'](
      evt('invoice.paid', {
        id: 'in_x',
        customer_email: 'owner@acme.test',
        amount_paid: 100,
        currency: 'aud',
      }),
      { log: makeLog(), supabase: sb.client },
    );
    expect(billing.sendReceiptEmail).toHaveBeenCalledTimes(1);
  });
});
