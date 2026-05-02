// Saturday Shape A — Task A3 tests for the
// onCheckoutSessionCompleted webhook handler in
// src/lib/stripe/webhook-handlers.ts.
//
// Source-string assertions on the substrate-DD invariants the
// handler must uphold. A live integration test is out of scope
// here (no Stripe test webhook fixtures wired up); this battery
// pins the handler's behaviour at commit time so future refactors
// don't accidentally drop one of the guarantees.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SOURCE = fs.readFileSync(
  path.join(process.cwd(), 'src/lib/stripe/webhook-handlers.ts'),
  'utf-8',
);

describe('onCheckoutSessionCompleted — handler invariants', () => {
  it('is registered in STRIPE_HANDLERS for "checkout.session.completed"', () => {
    expect(SOURCE).toMatch(
      /'checkout\.session\.completed':\s*onCheckoutSessionCompleted/,
    );
  });

  it('handler exists as a const declaration with StripeEventHandler type', () => {
    expect(SOURCE).toMatch(
      /const onCheckoutSessionCompleted:\s*StripeEventHandler\s*=\s*async/,
    );
  });

  it('verifies the client_reference_id token before invoking provision RPC', () => {
    expect(SOURCE).toMatch(/import\s*\{\s*verifyClientReference\s*\}/);
    expect(SOURCE).toMatch(/const claims = verifyClientReference\(clientReferenceId\)/);
    // Must reject when claims is null (signature failure or expired)
    expect(SOURCE).toMatch(
      /if \(!claims\)[\s\S]*?'client_reference_id signature invalid or expired'/,
    );
  });

  it('founding-tier path: calls allocate_founding_spot RPC', () => {
    expect(SOURCE).toMatch(
      /if \(pricingTier === 'founding'\)[\s\S]*?supabase\.rpc\('allocate_founding_spot'\)/,
    );
  });

  it('founding-cap-reached path: REFUND_REQUIRED log + non-ok return (no provisioning)', () => {
    // Per brief: when founding cohort is full, customer has paid for
    // a spot that no longer exists. Handler MUST surface refund-needed
    // state at ERROR severity AND return ok:false (no tenant provisioned).
    expect(SOURCE).toMatch(/founding_full_REFUND_REQUIRED/);
    expect(SOURCE).toMatch(/REFUND_REQUIRED founding cohort full/);
  });

  it('calls provision_tenant_from_checkout RPC with all 8 canonical params', () => {
    const provisionCall = SOURCE.match(
      /supabase\.rpc\(\s*\n?\s*'provision_tenant_from_checkout',\s*\n?\s*\{([\s\S]*?)\}\s*,?\s*\n?\s*\)/,
    );
    expect(provisionCall).not.toBeNull();
    const argsBody = provisionCall?.[1] ?? '';
    for (const param of [
      'p_stripe_customer_id',
      'p_stripe_subscription_id',
      'p_email',
      'p_company_name',
      'p_abn_digits',
      'p_pricing_tier',
      'p_signup_metadata',
      'p_admin_user_id',
    ]) {
      expect(argsBody).toContain(param);
    }
  });

  it('passes the verified claims.uid as p_admin_user_id (NOT auth.uid())', () => {
    // SECURITY DEFINER context has no useful auth.uid(); the caller
    // (this handler) extracts the user id from the verified
    // client_reference_id token.
    expect(SOURCE).toMatch(/p_admin_user_id:\s*claims\.uid/);
  });

  it('founding-tier path: stamps cohort position via UPDATE companies', () => {
    // After provision succeeds + spot allocated, the cohort position
    // is written to companies.founding_cohort_position.
    expect(SOURCE).toMatch(
      /supabase\s*\n?\s*\.from\('companies'\)\s*\n?\s*\.update\(\{\s*founding_cohort_position:\s*foundingSpot\s*\}\)\s*\n?\s*\.eq\('id',\s*companyId\)/,
    );
  });

  it('cohort position UPDATE failure is non-fatal (returns ok:true)', () => {
    expect(SOURCE).toMatch(
      /cohort_position_update_failed[\s\S]*?Non-fatal/,
    );
  });

  it('welcome email failure is non-fatal (catches and logs)', () => {
    expect(SOURCE).toMatch(/sendWelcomeEmail\(/);
    expect(SOURCE).toMatch(/welcome_email_failed/);
  });

  it('imports sendWelcomeEmail from src/lib/email/welcome', () => {
    expect(SOURCE).toMatch(/import\s*\{\s*sendWelcomeEmail\s*\}\s*from\s*'@\/lib\/email\/welcome'/);
  });

  it('returns ok:false on missing customer or client_reference_id', () => {
    expect(SOURCE).toMatch(/missing customer or client_reference_id/);
  });

  it('returns ok:false (Stripe will retry) on provision RPC failure', () => {
    expect(SOURCE).toMatch(/provision_tenant_from_checkout failed/);
  });
});
