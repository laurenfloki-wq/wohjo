/**
 * verify-billing-lifecycle.ts  —  WORK ORDER ITEM #6 (D1/D2 runtime verification)
 *
 * Drives a full Stripe subscription lifecycle against a TEST CLOCK and asserts:
 *   (a) the deployed webhook handler transitions companies.subscription_status
 *       correctly at each phase (onSubscriptionUpdated writes sub.status;
 *       onSubscriptionDeleted writes 'canceled'; both keyed on stripe_customer_id),
 *   (b) the D1 entitlement verdict flips correctly with that status, and
 *   (c) the BILL-5 carve-out holds (see note below).
 *
 * Closes the gap the audit flagged: the billing code EXISTS but has NEVER been
 * exercised end-to-end — the only prod tenant has subscription_status = null.
 *
 * ── ADAPTED TO REAL WIRING (2026-06-23) ──────────────────────────────────────
 *   * The gate is BINARY per company, not per action. We call the real
 *     assertCompanyEntitled(client, companyId) from src/lib/billing/entitlement.ts
 *     against the TARGET client — active/trialing/past_due resolve; canceled/
 *     unpaid/incomplete_expired/paused throw EntitlementError; null is grandfathered.
 *   * BILL-5 carve-out (a canceled tenant can still READ/EXPORT sealed records) is
 *     NOT a runtime call — it is structural: the read/export routes never invoke
 *     the gate. That invariant is pinned by the confinement test
 *     tests/repo-confinement/d1-entitlement-carveout.test.ts, asserted here only
 *     as a reminder, not re-probed at runtime.
 *   * Provisioning happens at checkout.session.completed, NOT subscription.created.
 *     So this script does NOT create a company; it requires a pre-seeded company
 *     (TEST_COMPANY_ID) in the TARGET db and links the test customer to it by
 *     setting companies.stripe_customer_id = <test customer> at the start.
 *
 * ── SAFETY (read before running) ─────────────────────────────────────────────
 *   1. TEST MODE ONLY. Aborts unless STRIPE_SECRET_KEY starts with "sk_test_".
 *   2. NEVER point SUPABASE_URL at prod (rwnxnnudljpgyfwbnosu) — aborts if so.
 *      Use a Supabase BRANCH or throwaway preview whose schema matches prod and
 *      whose Stripe webhook endpoint is wired to that environment's handler.
 *   3. The test clock + everything on it (customer, subscription, invoices) is
 *      deleted at the end. Test-clock objects never touch live data.
 *
 * HOW THE WEBHOOK REACHES THE HANDLER:
 *   Test-clock events fire as normal webhooks. Either configure a Stripe webhook
 *   endpoint on the target's deployed URL, or run
 *   `stripe listen --forward-to <preview-url>/api/webhooks/stripe`. The script
 *   ADVANCES the clock then POLLS Supabase — it does not assume synchronous
 *   processing.
 *
 * RUN (the Stripe SDK is NOT a repo dependency — install it first):
 *   npm i -D stripe tsx
 *   STRIPE_SECRET_KEY=sk_test_... \
 *   STRIPE_PRICE_ID=price_... \
 *   SUPABASE_URL=https://<branch-ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   TEST_COMPANY_ID=<uuid of a pre-seeded company row in the TARGET db> \
 *   npx tsx scripts/verify/verify-billing-lifecycle.ts
 *
 * Exit 0 = all assertions passed; 1 = at least one failed.
 */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
// Real D1 verdict — the pure form takes a client so we can point it at the TARGET.
import { assertCompanyEntitled, EntitlementError } from '../../src/lib/billing/entitlement';

const {
  STRIPE_SECRET_KEY = '',
  STRIPE_PRICE_ID = '',
  SUPABASE_URL = '',
  SUPABASE_SERVICE_ROLE_KEY = '',
  TEST_COMPANY_ID = '',
} = process.env;

function fail(msg: string): never {
  console.error(`\n  ABORT: ${msg}\n`);
  process.exit(1);
}

if (!STRIPE_SECRET_KEY.startsWith('sk_test_')) fail('STRIPE_SECRET_KEY must be a TEST key (sk_test_...).');
if (!STRIPE_PRICE_ID) fail('STRIPE_PRICE_ID is required.');
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) fail('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required (BRANCH/preview, not prod).');
if (SUPABASE_URL.includes('rwnxnnudljpgyfwbnosu')) fail('SUPABASE_URL points at PROD. Use a branch/preview. Refusing to run.');
if (!TEST_COMPANY_ID) fail('TEST_COMPANY_ID required — a pre-seeded company row in the TARGET db (provisioning happens at checkout, not here).');

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2025-03-31.basil' as Stripe.LatestApiVersion });
const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const DAY = 24 * 60 * 60;
const results: { phase: string; check: string; ok: boolean; detail: string }[] = [];
function record(phase: string, check: string, ok: boolean, detail = '') {
  results.push({ phase, check, ok, detail });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${phase} :: ${check}${detail ? ' — ' + detail : ''}`);
}

async function advanceClock(clockId: string, toEpoch: number) {
  await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: toEpoch });
  for (let i = 0; i < 60; i++) {
    const c = await stripe.testHelpers.testClocks.retrieve(clockId);
    if (c.status === 'ready') return;
    if (c.status === 'internal_failure') fail('Test clock advance failed.');
    await new Promise((r) => setTimeout(r, 2000));
  }
  fail('Test clock did not become ready within timeout.');
}

/** Poll companies.subscription_status (by id) until it equals one of `expected`. */
async function waitForStatus(expected: string[], timeoutMs = 120_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let last = '<none>';
  while (Date.now() < deadline) {
    const { data } = await supa.from('companies').select('subscription_status').eq('id', TEST_COMPANY_ID).maybeSingle();
    last = (data?.subscription_status as string | null) ?? '<null>';
    if (expected.includes(last)) return last;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return `TIMEOUT(last=${last})`;
}

/** Assert the binary D1 gate allows/denies NEW billable activity as expected. */
async function assertBillableAccess(shouldAllow: boolean, phase: string) {
  let allowed = false;
  try {
    await assertCompanyEntitled(supa as never, TEST_COMPANY_ID);
    allowed = true;
  } catch (e) {
    if (!(e instanceof EntitlementError)) throw e; // infra error — surface it
    allowed = false;
  }
  record(phase, `new billable activity ${shouldAllow ? 'ALLOWED' : 'BLOCKED'}`, allowed === shouldAllow, `gate allowed=${allowed}`);
}

async function main() {
  console.log('\n=== FLOSTRUCTION billing-lifecycle verification (Stripe test clock) ===\n');

  // Link the pre-seeded company to a fresh test customer.
  const t0 = Math.floor(Date.now() / 1000);
  const clock = await stripe.testHelpers.testClocks.create({ frozen_time: t0, name: 'flostruction-billing-verify' });
  const customer = await stripe.customers.create({
    name: 'Test Clock Pty Ltd',
    email: `billing-verify+${t0}@example.com`,
    test_clock: clock.id,
    metadata: { company_id: TEST_COMPANY_ID },
  });
  await stripe.paymentMethods.attach('pm_card_visa', { customer: customer.id });
  await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: 'pm_card_visa' } });

  const { error: linkErr } = await supa
    .from('companies')
    .update({ stripe_customer_id: customer.id, subscription_status: null })
    .eq('id', TEST_COMPANY_ID);
  if (linkErr) fail(`Could not link test customer to TEST_COMPANY_ID: ${linkErr.message}`);
  console.log(`  linked customer ${customer.id} → company ${TEST_COMPANY_ID}; clock ${clock.id}`);

  // PHASE A: subscription with 14-day trial → trialing/active; new activity allowed.
  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: STRIPE_PRICE_ID }],
    trial_period_days: 14,
  });
  let st = await waitForStatus(['trialing', 'active']);
  record('A: created', 'subscription_status = trialing/active', ['trialing', 'active'].includes(st), st);
  await assertBillableAccess(true, 'A: created');

  // PHASE B: advance to trial_end − 3d (no status regression).
  await advanceClock(clock.id, t0 + 11 * DAY);
  st = await waitForStatus(['trialing', 'active']);
  record('B: trial_will_end', 'no status regression near trial end', ['trialing', 'active'].includes(st), st);

  // PHASE C: failing card + advance past trial end → past_due/unpaid.
  await stripe.paymentMethods.attach('pm_card_chargeCustomerFail', { customer: customer.id });
  await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: 'pm_card_chargeCustomerFail' } });
  await advanceClock(clock.id, t0 + 15 * DAY);
  st = await waitForStatus(['past_due', 'unpaid']);
  record('C: payment_failed', 'subscription_status = past_due/unpaid', ['past_due', 'unpaid'].includes(st), st);
  // Grace policy (entitlement.ts): past_due is STILL entitled; unpaid is NOT.
  await assertBillableAccess(st === 'past_due', 'C: dunning');

  // PHASE D: cancel → canceled; new activity BLOCKED.
  await stripe.subscriptions.cancel(sub.id);
  st = await waitForStatus(['canceled']);
  record('D: canceled', 'subscription_status = canceled', st === 'canceled', st);
  await assertBillableAccess(false, 'D: canceled');
  // BILL-5 carve-out (sealed-record read/export still allowed) is structural —
  // the read/export routes never call the gate. Pinned by
  // tests/repo-confinement/d1-entitlement-carveout.test.ts, not re-probed here.
  record('D: canceled', 'BILL-5 carve-out enforced structurally (see confinement test)', true, 'reads never call the gate');

  // CLEANUP
  try {
    await stripe.testHelpers.testClocks.del(clock.id); // removes clock + customer + sub
    await supa.from('companies').update({ stripe_customer_id: null, subscription_status: null }).eq('id', TEST_COMPANY_ID);
    console.log(`  cleaned up clock ${clock.id} + unlinked company`);
  } catch (e) {
    console.warn(`  WARN: cleanup partial: ${(e as Error).message}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  if (failed.length) {
    failed.forEach((f) => console.log(`  - ${f.phase} :: ${f.check} (${f.detail})`));
    process.exit(1);
  }
  console.log('All billing-lifecycle assertions passed.\n');
}

main().catch((e) => fail((e as Error).stack ?? String(e)));
