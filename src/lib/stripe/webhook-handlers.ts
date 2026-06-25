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
import {
  sendTrialEndingEmail,
  sendReceiptEmail,
  sendDunningEmail,
  sendUpcomingInvoiceEmail,
  sendDisputeAlertEmail,
} from '@/lib/email/billing';

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

  // For founding tier: allocate a spot via optimistic-lock on founding_config
  // (CRACK 191 — removes allocate_founding_spot RPC dependency).
  // Read spots_remaining, gate on > 0, then UPDATE WHERE value=currentValue.
  // If 0 rows updated a concurrent checkout consumed the last spot; REFUND.
  // Refund is Lauren-side until Stripe Refunds API integration lands — logged
  // at ERROR severity so it surfaces in the standard alerting path.
  let foundingSpot: number | null = null;
  if (pricingTier === 'founding') {
    // B2 (2026-06-12): the allocation must be keyed to THIS event so a
    // re-dispatch after a partial failure (spot decremented, provision
    // failed) cannot decrement twice. The event's own stripe_event_log
    // row is the ledger: the allocated spot is persisted into
    // payload_summary immediately after the decrement (below); on
    // re-dispatch it is found here and reused instead of re-allocated.
    const { data: ownRow } = await supabase
      .from('stripe_event_log')
      .select('payload_summary')
      .eq('event_id', event.id)
      .maybeSingle();
    const priorSpot = (ownRow?.payload_summary as Record<string, unknown> | null)?.[
      'founding_spot'
    ];
    if (typeof priorSpot === 'number' && priorSpot > 0) {
      foundingSpot = priorSpot;
      log.info(
        { foundingSpot, eventId: event.id },
        'stripe.checkout.session.completed.founding_spot_reused',
      );
    } else {
      const { data: configRow, error: readErr } = await supabase
        .from('founding_config')
        .select('value')
        .eq('key', 'spots_remaining')
        .single();

      if (readErr || !configRow) {
        log.error(
          { err: readErr?.message, customerId, sessionId: session.id },
          'stripe.checkout.session.completed.founding_alloc_failed',
        );
        return {
          ok: false,
          summary: `checkout.session.completed sid=${session.id}`,
          error: `founding_config read failed: ${readErr?.message ?? 'row missing'}`,
        };
      }

      const currentRemaining = parseInt(configRow.value as string, 10);
      if (isNaN(currentRemaining) || currentRemaining <= 0) {
        log.error(
          { customerId, sessionId: session.id, email: claims.meta.email, subscriptionId },
          'stripe.checkout.session.completed.founding_full_REFUND_REQUIRED',
        );
        return {
          ok: false,
          summary: `checkout.session.completed sid=${session.id} REFUND_REQUIRED founding cohort full`,
          error: 'Founding cohort at capacity; refund required',
        };
      }

      const newRemaining = currentRemaining - 1;
      const { data: updated, error: updateErr } = await supabase
        .from('founding_config')
        .update({ value: String(newRemaining) })
        .eq('key', 'spots_remaining')
        .eq('value', String(currentRemaining))
        .select('key');

      if (updateErr) {
        log.error(
          { err: updateErr.message, customerId, sessionId: session.id },
          'stripe.checkout.session.completed.founding_alloc_failed',
        );
        return {
          ok: false,
          summary: `checkout.session.completed sid=${session.id}`,
          error: `founding spot allocation failed: ${updateErr.message}`,
        };
      }

      if (!updated || updated.length === 0) {
        // Concurrent checkout consumed the last spot between our read and update.
        log.error(
          { customerId, sessionId: session.id, email: claims.meta.email, subscriptionId },
          'stripe.checkout.session.completed.founding_full_REFUND_REQUIRED',
        );
        return {
          ok: false,
          summary: `checkout.session.completed sid=${session.id} REFUND_REQUIRED founding cohort full`,
          error: 'Founding cohort at capacity; refund required',
        };
      }

      foundingSpot = 20 - newRemaining; // 1-indexed cohort position (1=first, 20=last)

      // B2 (2026-06-12): persist the allocation onto THIS event's
      // stripe_event_log row BEFORE provisioning, so a failure later in
      // this handler followed by a Stripe-retry re-dispatch reuses the
      // spot instead of decrementing again.
      const { error: markErr } = await supabase
        .from('stripe_event_log')
        .update({
          payload_summary: {
            livemode: event.livemode,
            created: event.created,
            founding_spot: foundingSpot,
          },
        })
        .eq('event_id', event.id);
      if (markErr) {
        log.error(
          { err: markErr.message, eventId: event.id, foundingSpot },
          'stripe.checkout.session.completed.founding_marker_failed',
        );
        // Non-fatal: without the marker a re-dispatch could re-decrement —
        // identical exposure to pre-B2 behaviour, never worse.
      }
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
  const subStatus = (sub.status as string) ?? null; // D1 — canonical entitlement state
  let updateRow;
  if (companyId) {
    updateRow = supabase
      .from('companies')
      .update({
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        trial_ends_at: trialEnd,
        subscription_status: subStatus,
      })
      .eq('id', companyId);
  } else {
    updateRow = supabase
      .from('companies')
      .update({
        stripe_subscription_id: subscriptionId,
        trial_ends_at: trialEnd,
        subscription_status: subStatus,
      })
      .eq('stripe_customer_id', customerId);
  }
  const { error } = await updateRow;
  if (error) return { ok: false, summary: 'subscription.created', error: error.message };
  return { ok: true, summary: `subscription.created sub=${subscriptionId}` };
};

const onSubscriptionUpdated: StripeEventHandler = async (event, { log, supabase }) => {
  const sub = event.data.object as Record<string, any>;
  const subscriptionId = sub.id as string;
  const status = (sub.status as string) ?? null;
  const cancelledAt = sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null;
  log.info({ subscriptionId, status }, 'stripe.subscription.updated');
  // D1 — keep subscription_status canonical (active/trialing/past_due/...).
  // This is what the entitlement gate reads.
  const { error } = await supabase
    .from('companies')
    .update({ subscription_status: status, cancelled_at: cancelledAt })
    .eq('stripe_subscription_id', subscriptionId);
  if (error) return { ok: false, summary: 'subscription.updated', error: error.message };
  return { ok: true, summary: `subscription.updated sub=${subscriptionId} status=${status}` };
};

const onSubscriptionDeleted: StripeEventHandler = async (event, { log, supabase }) => {
  const sub = event.data.object as Record<string, any>;
  const subscriptionId = sub.id as string;
  log.warn({ subscriptionId }, 'stripe.subscription.deleted');
  // D1 — terminal: mark canceled so the entitlement gate moves the tenant to
  // read-only. Sealed records + pay history stay accessible (gate carve-out).
  const { error } = await supabase
    .from('companies')
    .update({ subscription_status: 'canceled', cancelled_at: new Date().toISOString() })
    .eq('stripe_subscription_id', subscriptionId);
  if (error) return { ok: false, summary: 'subscription.deleted', error: error.message };
  return { ok: true, summary: `subscription.deleted sub=${subscriptionId} → canceled` };
};

const onTrialWillEnd: StripeEventHandler = async (event, { log, supabase }) => {
  const sub = event.data.object as Record<string, any>;
  log.info({ sub: sub.id, trialEnd: sub.trial_end }, 'stripe.trial_will_end');
  // 7-day-out reminder. The subscription object carries no email, so resolve
  // the tenant's billing contact by stripe_customer_id. Non-fatal throughout:
  // a missing email or a down provider must never make Stripe retry.
  try {
    const customerId = sub.customer as string | null;
    if (!customerId) {
      log.warn({ sub: sub.id }, 'stripe.trial_will_end.no_customer');
      return { ok: true, summary: `subscription.trial_will_end sub=${sub.id} (no customer)` };
    }
    const { data: company } = await supabase
      .from('companies')
      .select('name, billing_contact_email')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    const to =
      (company as { billing_contact_email?: string | null } | null)?.billing_contact_email ?? null;
    if (!to) {
      log.warn({ sub: sub.id, customerId }, 'stripe.trial_will_end.no_billing_email');
      return { ok: true, summary: `subscription.trial_will_end sub=${sub.id} (no email)` };
    }
    await sendTrialEndingEmail({
      to,
      companyName: (company as { name?: string | null } | null)?.name ?? null,
      trialEndsAt: (sub.trial_end as number | null) ?? null,
    });
  } catch (emailErr) {
    log.error(
      { err: emailErr instanceof Error ? emailErr.message : String(emailErr), sub: sub.id },
      'stripe.trial_will_end.email_failed',
    );
  }
  return { ok: true, summary: `subscription.trial_will_end sub=${sub.id}` };
};

const onInvoicePaid: StripeEventHandler = async (event, { log }) => {
  const inv = event.data.object as Record<string, any>;
  log.info({ invoiceId: inv.id, amountCents: inv.amount_paid }, 'stripe.invoice.paid');
  // Receipt email. The invoice carries customer_email directly. Non-fatal.
  try {
    const to = (inv.customer_email as string | null) ?? null;
    if (!to) {
      log.warn({ invoiceId: inv.id }, 'stripe.invoice.paid.no_email');
    } else {
      await sendReceiptEmail({
        to,
        amountPaidMinor: (inv.amount_paid as number) ?? 0,
        currency: (inv.currency as string) ?? 'aud',
        invoiceNumber: (inv.number as string | null) ?? null,
        hostedInvoiceUrl: (inv.hosted_invoice_url as string | null) ?? null,
        paidAt:
          (inv.status_transitions?.paid_at as number | null) ??
          (inv.created as number | null) ??
          null,
      });
    }
  } catch (emailErr) {
    log.error(
      { err: emailErr instanceof Error ? emailErr.message : String(emailErr), invoiceId: inv.id },
      'stripe.invoice.paid.email_failed',
    );
  }
  return { ok: true, summary: `invoice.paid inv=${inv.id} amount=${inv.amount_paid}` };
};

const onInvoicePaymentFailed: StripeEventHandler = async (event, { log }) => {
  const inv = event.data.object as Record<string, any>;
  log.warn({ invoiceId: inv.id, attempt: inv.attempt_count }, 'stripe.invoice.payment_failed');
  // Dunning email per attempt. Suspension is Stripe-dunning-driven (Stripe
  // moves the sub past_due → unpaid/canceled; the entitlement gate reads that)
  // — we do NOT keep a parallel in-app suspension counter here. Non-fatal.
  try {
    const to = (inv.customer_email as string | null) ?? null;
    if (!to) {
      log.warn({ invoiceId: inv.id }, 'stripe.invoice.payment_failed.no_email');
    } else {
      await sendDunningEmail({
        to,
        amountDueMinor: (inv.amount_due as number) ?? 0,
        currency: (inv.currency as string) ?? 'aud',
        attemptCount: (inv.attempt_count as number) ?? 0,
        nextAttemptAt: (inv.next_payment_attempt as number | null) ?? null,
        hostedInvoiceUrl: (inv.hosted_invoice_url as string | null) ?? null,
      });
    }
  } catch (emailErr) {
    log.error(
      { err: emailErr instanceof Error ? emailErr.message : String(emailErr), invoiceId: inv.id },
      'stripe.invoice.payment_failed.email_failed',
    );
  }
  return { ok: true, summary: `invoice.payment_failed inv=${inv.id} attempt=${inv.attempt_count}` };
};

const onInvoiceUpcoming: StripeEventHandler = async (event, { log }) => {
  const inv = event.data.object as Record<string, any>;
  log.info({ amountCents: inv.amount_due }, 'stripe.invoice.upcoming');
  // 7-day forecast email. Upcoming invoices have no id; use customer_email
  // and the next-attempt/period-end date. Non-fatal.
  try {
    const to = (inv.customer_email as string | null) ?? null;
    if (!to) {
      log.warn({}, 'stripe.invoice.upcoming.no_email');
    } else {
      await sendUpcomingInvoiceEmail({
        to,
        amountDueMinor: (inv.amount_due as number) ?? 0,
        currency: (inv.currency as string) ?? 'aud',
        nextChargeAt:
          (inv.next_payment_attempt as number | null) ?? (inv.period_end as number | null) ?? null,
      });
    }
  } catch (emailErr) {
    log.error(
      { err: emailErr instanceof Error ? emailErr.message : String(emailErr) },
      'stripe.invoice.upcoming.email_failed',
    );
  }
  return { ok: true, summary: `invoice.upcoming amount=${inv.amount_due}` };
};

const onChargeDisputeCreated: StripeEventHandler = async (event, { log }) => {
  const dispute = event.data.object as Record<string, any>;
  log.error(
    { disputeId: dispute.id, amount: dispute.amount, reason: dispute.reason },
    'stripe.charge.dispute.created',
  );
  // Immediate founder alert; pause-service decision is founder-led (we do not
  // auto-suspend). Non-fatal — a down provider must not make Stripe retry.
  try {
    await sendDisputeAlertEmail({
      disputeId: (dispute.id as string) ?? 'unknown',
      amountMinor: (dispute.amount as number) ?? 0,
      currency: (dispute.currency as string) ?? 'aud',
      reason: (dispute.reason as string | null) ?? null,
      evidenceDueBy: (dispute.evidence_details?.due_by as number | null) ?? null,
      chargeId: (dispute.charge as string | null) ?? null,
    });
  } catch (emailErr) {
    log.error(
      {
        err: emailErr instanceof Error ? emailErr.message : String(emailErr),
        disputeId: dispute.id,
      },
      'stripe.charge.dispute.created.email_failed',
    );
  }
  return {
    ok: true,
    summary: `charge.dispute.created dispute=${dispute.id} reason=${dispute.reason}`,
  };
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
    await supabase
      .from('companies')
      .update({
        billing_contact_email: cust.email as string,
      })
      .eq('stripe_customer_id', cust.id as string);
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
