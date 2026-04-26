// Stripe webhook event handler registry.
//
// Each handler is invoked AFTER signature verification + idempotency
// check. Handlers should be:
//   - idempotent (a replayed event should produce the same end state)
//   - synchronous (return a result; don't fire-and-forget)
//   - logged (use the routeLogger like other API routes)
//
// The handler registry is keyed on Stripe event type. Unknown event
// types are no-op'd (log + 200) — Stripe will keep delivering them
// until we explicitly subscribe to them at the dashboard level.

import type { Logger } from 'pino';

export interface StripeEvent {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  data: {
    object: Record<string, unknown>;
    previous_attributes?: Record<string, unknown>;
  };
}

export interface HandlerContext {
  log: Logger;
  /** Service-role Supabase client */
  supabase: import('@supabase/supabase-js').SupabaseClient;
}

export interface HandlerResult {
  ok: boolean;
  /** Human-readable summary for the stripe_event_log row */
  summary: string;
  /** If ok=false, why */
  error?: string;
}

export type StripeEventHandler = (
  event: StripeEvent,
  ctx: HandlerContext,
) => Promise<HandlerResult>;

// ── Handlers ─────────────────────────────────────────────────────────

const onSubscriptionCreated: StripeEventHandler = async (event, { log, supabase }) => {
  const sub = event.data.object as Record<string, any>;
  const customerId = sub.customer as string;
  const subscriptionId = sub.id as string;
  const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;

  log.info({ customerId, subscriptionId, trialEnd }, 'stripe.subscription.created');

  // The subscription's metadata.company_id is set at creation time by
  // the onboarding billing endpoint. Fall back to looking up by
  // stripe_customer_id if metadata is absent (defensive).
  const companyId = (sub.metadata?.company_id as string) ?? null;
  let updateRow;
  if (companyId) {
    updateRow = supabase.from('companies').update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      trial_ends_at: trialEnd,
    }).eq('id', companyId);
  } else {
    updateRow = supabase.from('companies').update({
      stripe_subscription_id: subscriptionId,
      trial_ends_at: trialEnd,
    }).eq('stripe_customer_id', customerId);
  }
  const { error } = await updateRow;
  if (error) return { ok: false, summary: 'subscription.created', error: error.message };
  return { ok: true, summary: `subscription.created sub=${subscriptionId}` };
};

const onSubscriptionUpdated: StripeEventHandler = async (event, { log, supabase }) => {
  const sub = event.data.object as Record<string, any>;
  const subscriptionId = sub.id as string;
  log.info({ subscriptionId, status: sub.status }, 'stripe.subscription.updated');
  // Plan/status changes — sync the relevant fields. Tier reassignment
  // (cancel_at_period_end, etc.) goes here.
  // For the scaffold: just log; full reconciliation lives in a follow-up.
  return { ok: true, summary: `subscription.updated sub=${subscriptionId} status=${sub.status}` };
};

const onSubscriptionDeleted: StripeEventHandler = async (event, { log, supabase }) => {
  const sub = event.data.object as Record<string, any>;
  const subscriptionId = sub.id as string;
  log.warn({ subscriptionId }, 'stripe.subscription.deleted');
  // Service status → cancelled. Data retention per contract §8.
  // For the scaffold: log; full cancellation flow ships with /command Settings UI.
  return { ok: true, summary: `subscription.deleted sub=${subscriptionId}` };
};

const onTrialWillEnd: StripeEventHandler = async (event, { log }) => {
  const sub = event.data.object as Record<string, any>;
  log.info({ sub: sub.id, trialEnd: sub.trial_end }, 'stripe.trial_will_end');
  // TODO: queue a 7-day-out reminder email via Resend.
  return { ok: true, summary: `subscription.trial_will_end sub=${sub.id}` };
};

const onInvoicePaid: StripeEventHandler = async (event, { log }) => {
  const inv = event.data.object as Record<string, any>;
  log.info({ invoiceId: inv.id, amountCents: inv.amount_paid }, 'stripe.invoice.paid');
  // TODO: receipt email; ensure service_active.
  return { ok: true, summary: `invoice.paid inv=${inv.id} amount=${inv.amount_paid}` };
};

const onInvoicePaymentFailed: StripeEventHandler = async (event, { log }) => {
  const inv = event.data.object as Record<string, any>;
  log.warn({ invoiceId: inv.id, attempt: inv.attempt_count }, 'stripe.invoice.payment_failed');
  // TODO: dunning email per attempt; service suspension after 3 failed retries.
  return { ok: true, summary: `invoice.payment_failed inv=${inv.id} attempt=${inv.attempt_count}` };
};

const onInvoiceUpcoming: StripeEventHandler = async (event, { log }) => {
  const inv = event.data.object as Record<string, any>;
  log.info({ amountCents: inv.amount_due }, 'stripe.invoice.upcoming');
  // TODO: 7-day forecast email.
  return { ok: true, summary: `invoice.upcoming amount=${inv.amount_due}` };
};

const onChargeDisputeCreated: StripeEventHandler = async (event, { log }) => {
  const dispute = event.data.object as Record<string, any>;
  log.error({ disputeId: dispute.id, amount: dispute.amount, reason: dispute.reason }, 'stripe.charge.dispute.created');
  // TODO: email founder immediately; pause-service decision is founder-led.
  return { ok: true, summary: `charge.dispute.created dispute=${dispute.id} reason=${dispute.reason}` };
};

const onPaymentMethodAttached: StripeEventHandler = async (event, { log }) => {
  const pm = event.data.object as Record<string, any>;
  log.info({ pm: pm.id, customer: pm.customer }, 'stripe.payment_method.attached');
  return { ok: true, summary: `payment_method.attached pm=${pm.id}` };
};

const onCustomerUpdated: StripeEventHandler = async (event, { log, supabase }) => {
  const cust = event.data.object as Record<string, any>;
  log.info({ customerId: cust.id }, 'stripe.customer.updated');
  // Sync billing email if it changed.
  if (cust.email) {
    await supabase.from('companies').update({
      billing_contact_email: cust.email as string,
    }).eq('stripe_customer_id', cust.id as string);
  }
  return { ok: true, summary: `customer.updated cus=${cust.id}` };
};

// ── Registry ─────────────────────────────────────────────────────────

export const STRIPE_HANDLERS: Record<string, StripeEventHandler> = {
  'customer.subscription.created': onSubscriptionCreated,
  'customer.subscription.updated': onSubscriptionUpdated,
  'customer.subscription.deleted': onSubscriptionDeleted,
  'customer.subscription.trial_will_end': onTrialWillEnd,
  'invoice.paid': onInvoicePaid,
  'invoice.payment_failed': onInvoicePaymentFailed,
  'invoice.upcoming': onInvoiceUpcoming,
  'charge.dispute.created': onChargeDisputeCreated,
  'payment_method.attached': onPaymentMethodAttached,
  'customer.updated': onCustomerUpdated,
};

export function lookupHandler(eventType: string): StripeEventHandler | null {
  return STRIPE_HANDLERS[eventType] ?? null;
}
