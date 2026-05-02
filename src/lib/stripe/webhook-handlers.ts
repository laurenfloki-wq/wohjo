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

import { verifyClientReference } from '@/app/api/stripe/checkout/route';
import { sendWelcomeEmail } from '@/lib/email/welcome';

/**
 * Saturday Shape A — Task A3.
 *
 * Fires when a Stripe Checkout Session completes successfully (the
 * customer has paid / authorised the subscription). Atomically
 * provisions the tenant via provision_tenant_from_checkout RPC
 * (Saturday Task A1), allocates a founding spot if applicable
 * (Saturday Task A2), and dispatches the welcome email.
 *
 * Event shape (per Stripe checkout.session.completed):
 *   data.object.id                  cs_test_... | cs_live_...
 *   data.object.customer             cus_...
 *   data.object.subscription         sub_...    (subscription mode only)
 *   data.object.client_reference_id  signed token from /api/stripe/checkout
 *   data.object.metadata             { pricing_tier, billing_cadence,
 *                                      signup_idempotency }
 *
 * Idempotency: the route-level handler already deduplicates on
 * stripe_event_log.event_id. Additionally, provision_tenant_from_checkout
 * is idempotent on stripe_customer_id (returns existing company id
 * without creating a duplicate).
 */
const onCheckoutSessionCompleted: StripeEventHandler = async (event, { log, supabase }) => {
  const session = event.data.object as Record<string, any>;
  const customerId = session.customer as string | null;
  const subscriptionId = (session.subscription as string | null) ?? null;
  const clientReferenceId = session.client_reference_id as string | null;
  const meta = (session.metadata as Record<string, string> | null) ?? {};

  log.info(
    { sessionId: session.id, customerId, subscriptionId },
    'stripe.checkout.session.completed.received',
  );

  if (!customerId || !clientReferenceId) {
    return {
      ok: false,
      summary: `checkout.session.completed sid=${session.id}`,
      error: 'missing customer or client_reference_id',
    };
  }

  const claims = verifyClientReference(clientReferenceId);
  if (!claims) {
    log.warn({ sessionId: session.id }, 'stripe.checkout.session.completed.client_ref_invalid');
    return {
      ok: false,
      summary: `checkout.session.completed sid=${session.id}`,
      error: 'client_reference_id signature invalid or expired',
    };
  }

  const pricingTier = (meta.pricing_tier ?? 'standard') as string;

  // For founding tier: allocate a spot atomically. If returns -1 the
  // cohort is full and we MUST refund the customer (they paid for a
  // spot that no longer exists). Refund is Lauren-side mechanical
  // until Stripe Refunds API integration lands — this commit logs the
  // refund-needed state at ERROR severity so it surfaces in the
  // standard alerting path.
  let foundingSpot: number | null = null;
  if (pricingTier === 'founding') {
    const { data: spotData, error: spotErr } = await supabase.rpc('allocate_founding_spot');
    if (spotErr) {
      log.error(
        { err: spotErr.message, customerId, sessionId: session.id },
        'stripe.checkout.session.completed.founding_alloc_failed',
      );
      return {
        ok: false,
        summary: `checkout.session.completed sid=${session.id}`,
        error: `allocate_founding_spot failed: ${spotErr.message}`,
      };
    }
    foundingSpot = typeof spotData === 'number' ? spotData : -1;
    if (foundingSpot === -1) {
      log.error(
        {
          customerId,
          sessionId: session.id,
          email: claims.meta.email,
          subscriptionId,
        },
        'stripe.checkout.session.completed.founding_full_REFUND_REQUIRED',
      );
      // Surface to Lauren via the standard alerting path. Refund + reverse
      // the subscription is Lauren-side until Stripe Refunds + sub-cancel
      // API integration lands. Tenant is NOT provisioned; customer email
      // is preserved in stripe_event_log for follow-up.
      return {
        ok: false,
        summary: `checkout.session.completed sid=${session.id} REFUND_REQUIRED founding cohort full`,
        error: 'Founding cohort at capacity; refund required',
      };
    }
  }

  // Atomic provision via RPC (Saturday Task A1). The function is
  // idempotent on stripe_customer_id, so a webhook replay safely
  // returns the existing company id.
  const { data: companyId, error: provisionErr } = await supabase.rpc(
    'provision_tenant_from_checkout',
    {
      p_stripe_customer_id: customerId,
      p_stripe_subscription_id: subscriptionId,
      p_email: claims.meta.email,
      p_company_name: claims.meta.company_name,
      p_abn_digits: claims.meta.abn_digits,
      p_pricing_tier: pricingTier,
      p_signup_metadata: meta,
      p_admin_user_id: claims.uid,
    },
  );

  if (provisionErr) {
    log.error(
      { err: provisionErr.message, customerId, sessionId: session.id },
      'stripe.checkout.session.completed.provision_failed',
    );
    return {
      ok: false,
      summary: `checkout.session.completed sid=${session.id}`,
      error: `provision_tenant_from_checkout failed: ${provisionErr.message}`,
    };
  }

  // For founding tier: stamp the cohort position on the company row.
  // This is a separate UPDATE (rather than passing into the provision
  // function) because the founding-spot allocation is gated AFTER
  // payment success — provision_tenant_from_checkout deliberately
  // doesn't know about cohort allocation. Both are atomic at their
  // own layer.
  if (foundingSpot !== null && foundingSpot > 0) {
    const { error: cohortErr } = await supabase
      .from('companies')
      .update({ founding_cohort_position: foundingSpot })
      .eq('id', companyId);
    if (cohortErr) {
      log.error(
        { err: cohortErr.message, companyId, foundingSpot },
        'stripe.checkout.session.completed.cohort_position_update_failed',
      );
      // Non-fatal — the company is provisioned; cohort position can be
      // re-stamped via a manual SQL UPDATE. Surface to Lauren via the
      // alert path but return ok:true so Stripe doesn't retry.
    }
  }

  // Welcome email — non-fatal. If Resend is down, the company is
  // provisioned; Lauren can resend manually.
  try {
    await sendWelcomeEmail({
      to: claims.meta.email,
      companyName: claims.meta.company_name,
      pricingTier,
      foundingSpot,
    });
  } catch (emailErr) {
    log.error(
      { err: emailErr instanceof Error ? emailErr.message : String(emailErr), companyId },
      'stripe.checkout.session.completed.welcome_email_failed',
    );
  }

  log.info(
    { companyId, customerId, sessionId: session.id, pricingTier, foundingSpot },
    'stripe.checkout.session.completed.provisioned',
  );

  return {
    ok: true,
    summary: `checkout.session.completed sid=${session.id} → company=${companyId}${foundingSpot !== null ? ` foundingSpot=${foundingSpot}` : ''}`,
  };
};

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
  'checkout.session.completed': onCheckoutSessionCompleted,
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
