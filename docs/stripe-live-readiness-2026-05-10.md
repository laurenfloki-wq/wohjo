# Stripe Live-Mode Readiness Audit — 2026-05-10

**Scope:** Read-only code audit of `src/lib/stripe/`, `src/app/api/stripe/`, and `src/lib/stripe/pricing.ts`. No Stripe dashboard access was used.  
**Auditor:** Automated session (WS8)  
**Status:** Pre-launch checklist for Mo's 12 May payroll cycle and the first Founding Cohort checkout.

---

## 1. Env vars required in production (Vercel)

| Var                         | Where used                                   | Live-mode value shape                              |
| --------------------------- | -------------------------------------------- | -------------------------------------------------- |
| `STRIPE_SECRET_KEY`         | `src/app/api/stripe/checkout/route.ts:122`   | `sk_live_…`                                        |
| `STRIPE_WEBHOOK_SECRET`     | `src/app/api/stripe/webhook/route.ts:41`     | `whsec_…` (from live endpoint in Stripe dashboard) |
| `NEXT_PUBLIC_SUPABASE_URL`  | Webhook route (Supabase client)              | _(same as test)_                                   |
| `SUPABASE_SERVICE_ROLE_KEY` | Webhook route (service-role client)          | _(live Supabase project)_                          |
| `CLIENT_REF_SIGNING_SECRET` | Checkout route (signs `client_reference_id`) | Rotate from test; 32+ bytes                        |

**No `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is used.** The checkout route creates a Stripe Checkout Session server-side and returns the session URL for redirect — no client-side Stripe.js integration. ✅

---

## 2. Stripe product / price objects required (per `src/lib/stripe/pricing.ts` TIERS)

All prices need to be created in **live mode** with the `lookup_key` matching the values in `TIERS`. The lookup key is the stable identifier used at checkout session creation.

| lookup_key           | Amount (AUD)   | Interval | Notes                                                                                                                                                  |
| -------------------- | -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `founding-monthly`   | A$399.00/mo    | monthly  | Founding cohort only; not self-serve                                                                                                                   |
| `standard-monthly`   | A$499.00/mo    | monthly  |                                                                                                                                                        |
| `standard-yearly`    | A$5,389.20/yr  | yearly   |                                                                                                                                                        |
| `growth-monthly`     | A$999.00/mo    | monthly  |                                                                                                                                                        |
| `growth-yearly`      | A$10,789.20/yr | yearly   |                                                                                                                                                        |
| `scale-monthly`      | A$1,999.00/mo  | monthly  |                                                                                                                                                        |
| `scale-yearly`       | A$21,589.20/yr | yearly   |                                                                                                                                                        |
| `enterprise-monthly` | Bespoke        | —        | Sales-led; `monthly_aud_cents: 0` in code. Verify this price object is NOT created in Stripe (enterprise goes through manual invoicing, not Checkout). |

**Action:** Run `stripe prices list --lookup-key standard-monthly` against the live key to confirm each object exists before the first checkout.

---

## 3. Webhook endpoint configuration

Webhook route is at `/api/stripe/webhook` (`src/app/api/stripe/webhook/route.ts`).

**Events that MUST be subscribed** in the live Stripe dashboard endpoint:

| Event                                  | Handler                      | Status                                                                   |
| -------------------------------------- | ---------------------------- | ------------------------------------------------------------------------ |
| `checkout.session.completed`           | `onCheckoutSessionCompleted` | ✅ Full: provisions tenant, allocates founding spot, sends welcome email |
| `customer.subscription.created`        | `onSubscriptionCreated`      | ✅ Syncs stripe IDs + trial end                                          |
| `customer.subscription.updated`        | `onSubscriptionUpdated`      | ⚠️ **TODO: just logs; no plan/status reconciliation**                    |
| `customer.subscription.deleted`        | `onSubscriptionDeleted`      | ⚠️ **TODO: just logs; no service cancellation**                          |
| `customer.subscription.trial_will_end` | `onTrialWillEnd`             | ⚠️ **TODO: 7-day reminder email not implemented**                        |
| `invoice.paid`                         | `onInvoicePaid`              | ⚠️ **TODO: no receipt email; no service_active sync**                    |
| `invoice.payment_failed`               | `onInvoicePaymentFailed`     | ⚠️ **TODO: no dunning email; no service suspension**                     |
| `invoice.upcoming`                     | `onInvoiceUpcoming`          | ⚠️ **TODO: no 7-day forecast email**                                     |
| `charge.dispute.created`               | `onChargeDisputeCreated`     | ⚠️ **TODO: logs ERROR but sends no notification to founder**             |
| `payment_method.attached`              | `onPaymentMethodAttached`    | ✅ Logs only (acceptable)                                                |
| `customer.updated`                     | `onCustomerUpdated`          | ✅ Syncs billing email                                                   |

**Risk level for pre-launch:**

- `subscription.deleted` and `invoice.payment_failed` have no service suspension — a churned or failed-payment customer keeps access. **This is a revenue-protection gap.** Lauren-confirmed acceptable until /command Settings billing UI ships.
- `charge.dispute.created` only logs ERROR — founder does not receive an immediate alert. **Monitor the Vercel error log or connect a Slack alert** before going live.

---

## 4. Supabase tables / RPC required

| Object                               | Purpose                                                                                                                           | Exists in production?                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `stripe_event_log`                   | Idempotency dedup for all webhook events. Schema: `event_id (PK), event_type, received_at, processed_at, payload_summary (jsonb)` | Verify via `information_schema.tables`           |
| `founding_config`                    | Rows: `key='spots_remaining', value='20'` (string). Used for optimistic-lock cohort allocation.                                   | Verify row exists before first founding checkout |
| `provision_tenant_from_checkout` RPC | Atomic: create company + admin user + set stripe IDs                                                                              | Verify RPC exists in production Supabase         |

**Action before founding cohort launch:** Run:

```sql
SELECT value FROM founding_config WHERE key = 'spots_remaining';
```

Confirms the row is seeded. If missing, INSERT it before any founding checkout or the handler will return `ok: false` (Stripe will retry endlessly).

---

## 5. Security observations

### 5a. No `livemode` guard in webhook route

The webhook route (`route.ts`) does not check `event.livemode`. In practice, Stripe only sends live events to a live-mode endpoint (the `whsec_` secret only validates signatures from the matching mode). However, if the wrong webhook secret were accidentally used (e.g., test secret pointed at the live endpoint), test events would be processed and create real database rows.

**Recommendation:** Add a guard in production:

```typescript
if (!event.livemode && process.env.NODE_ENV === 'production') {
  log.warn({ eventId: event.id }, 'stripe.webhook.test_event_in_production');
  return NextResponse.json({ received: true, skipped: 'test_mode' }, { status: 200 });
}
```

### 5b. `REFUND_REQUIRED` is manual

When the founding cohort fills during a concurrent checkout (`spots_remaining` optimistic-lock fails), the handler:

1. Logs `ERROR` at `stripe.checkout.session.completed.founding_full_REFUND_REQUIRED`
2. Returns `ok: false` — Stripe will retry 3× and then fail the delivery
3. The customer's subscription is active but the company is NOT provisioned

**Lauren must monitor the Stripe webhook delivery log** for `founding_full_REFUND_REQUIRED` errors during the founding cohort period (first 20 checkouts). Manual refund via Stripe dashboard required.

### 5c. `CLIENT_REF_SIGNING_SECRET` scope

The `client_reference_id` on the checkout session is a signed JWT containing the pre-signup user's claims. If this secret is ever leaked, an attacker could forge checkout completions. Ensure it:

- Is NOT in any committed file (checked: not in `.env.local` or source)
- Is rotated between test and live environments
- Is 32+ random bytes

---

## 6. Billing flow completeness summary

| Flow                                       | Code status                                      | Pre-launch required?                          |
| ------------------------------------------ | ------------------------------------------------ | --------------------------------------------- |
| Free trial → paid subscription             | ✅ `subscription.created` writes `trial_ends_at` | Yes                                           |
| Founding cohort checkout                   | ✅ Full optimistic-lock + cohort position        | Yes                                           |
| Trial will end email                       | ⚠️ TODO                                          | No (nice-to-have; no automated enforcement)   |
| Invoice receipt email                      | ⚠️ TODO                                          | No                                            |
| Failed payment → dunning                   | ⚠️ TODO                                          | No (manual for now)                           |
| Subscription cancelled → service suspended | ⚠️ TODO                                          | No (Lauren-confirmed deferred)                |
| Dispute alert                              | ⚠️ No founder notification                       | **Monitor manually pre-launch**               |
| Plan upgrade/downgrade reconciliation      | ⚠️ TODO                                          | No (first customers will be on founding tier) |

---

## 7. Pre-launch action checklist (Lauren)

- [ ] Confirm all 8 price lookup keys exist in Stripe live mode
- [ ] Confirm `founding_config.spots_remaining = 20` in production Supabase
- [ ] Confirm `stripe_event_log` table exists in production Supabase
- [ ] Confirm `provision_tenant_from_checkout` RPC exists in production Supabase
- [ ] Set `STRIPE_SECRET_KEY=sk_live_…` in Vercel production env
- [ ] Set `STRIPE_WEBHOOK_SECRET=whsec_…` (from live webhook endpoint) in Vercel production env
- [ ] Subscribe all 11 events listed in Section 3 to the `/api/stripe/webhook` live endpoint
- [ ] Manually monitor Stripe webhook delivery log during founding cohort period for `REFUND_REQUIRED` errors
- [ ] Optionally add `livemode` guard (Section 5a) before first live checkout
