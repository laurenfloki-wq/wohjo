// Schema-drift + structural-shape guard tests for migration
// migrations/202605020900_atomic_provision_tenant.sql.
//
// Cowork cannot exercise the function against a live PG instance from
// the test runner (no PGlite/test-DB harness is wired up here), but
// the substrate-DD guard battery the codebase has settled on uses
// source-string assertions to catch:
//   - Migration shape — function signature, security mode, atomicity
//     guarantees, idempotency-on-stripe_customer_id behaviour
//   - Drizzle schema mirror — every column the function INSERTs into
//     is reflected in src/db/schema.ts
//   - Webhook contract — the migration's parameter set matches what
//     the future Saturday Task 3 webhook handler will pass

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATION = fs.readFileSync(
  path.join(process.cwd(), 'migrations/202605020900_atomic_provision_tenant.sql'),
  'utf-8',
);
const SCHEMA = fs.readFileSync(path.join(process.cwd(), 'src/db/schema.ts'), 'utf-8');

describe('Migration 202605020900 — atomic_provision_tenant function shape', () => {
  it('declares CREATE OR REPLACE FUNCTION public.provision_tenant_from_checkout', () => {
    expect(MIGRATION).toMatch(/CREATE OR REPLACE FUNCTION public\.provision_tenant_from_checkout/);
  });

  it('uses SECURITY DEFINER for service-role-only invocation', () => {
    expect(MIGRATION).toMatch(/SECURITY DEFINER/);
  });

  it('sets search_path = public to harden against search_path manipulation', () => {
    expect(MIGRATION).toMatch(/SET search_path = public/);
  });

  it('REVOKEs EXECUTE FROM PUBLIC and GRANTs only to service_role', () => {
    expect(MIGRATION).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.provision_tenant_from_checkout[\s\S]*?FROM PUBLIC/,
    );
    expect(MIGRATION).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.provision_tenant_from_checkout[\s\S]*?TO service_role/,
    );
  });

  it('exposes the canonical 8-parameter signature the webhook handler calls', () => {
    // Pin the exact parameter shape so the future Stripe checkout
    // webhook handler can compose its rpc() call with confidence.
    const expectedParams = [
      'p_stripe_customer_id text',
      'p_stripe_subscription_id text',
      'p_email text',
      'p_company_name text',
      'p_abn_digits text',
      'p_pricing_tier text',
      'p_signup_metadata jsonb',
      'p_admin_user_id uuid',
    ];
    for (const param of expectedParams) {
      expect(MIGRATION).toContain(param);
    }
  });

  it('idempotency guard: SELECT existing companies row by stripe_customer_id BEFORE INSERT', () => {
    // The brief's substrate-DD constraint: same stripe_customer_id
    // returns same company_id. This pin asserts the SELECT happens
    // before the INSERT — the textual order in the function body
    // matters because PL/pgSQL is sequential.
    const selectPos = MIGRATION.search(
      /SELECT id INTO v_company_id\s*\n\s*FROM public\.companies\s*\n\s*WHERE stripe_customer_id = p_stripe_customer_id/,
    );
    const insertPos = MIGRATION.search(/INSERT INTO public\.companies \(/);
    expect(selectPos).toBeGreaterThan(0);
    expect(insertPos).toBeGreaterThan(selectPos);
  });

  it('inserts companies + admins atomically (both in same function body)', () => {
    expect(MIGRATION).toMatch(/INSERT INTO public\.companies \(/);
    expect(MIGRATION).toMatch(/INSERT INTO public\.admins \(/);
  });

  it('admins INSERT uses director role per cl 3.2 Initial Director pattern', () => {
    expect(MIGRATION).toMatch(/INSERT INTO public\.admins \([\s\S]*?VALUES \([\s\S]*?'director'/);
  });

  it('sets signup_step to "site" post-checkout (next wizard step per state-machine.ts)', () => {
    expect(MIGRATION).toMatch(/'site'/);
    expect(MIGRATION).toMatch(/signup_step,/);
  });

  it('writes accepted_terms_at to now() (terms accepted as part of checkout)', () => {
    expect(MIGRATION).toMatch(/accepted_terms_at/);
    expect(MIGRATION).toMatch(/now\(\)/);
  });

  it('does NOT auto-apply (header explicitly notes Lauren-side application)', () => {
    expect(MIGRATION).toMatch(/DO NOT auto-apply/);
  });

  it('preserves Joao E2E sacred zone (header explicitly notes test tenant unaffected)', () => {
    expect(MIGRATION).toMatch(/Joao E2E test sacred zone/);
    expect(MIGRATION).toMatch(/00000000-1000-0000-0000-000000000001/);
  });
});

describe('Drizzle companies schema — production column mirror (Friday audit Section 2.7 closure)', () => {
  it('mirrors stripe_customer_id and stripe_subscription_id', () => {
    expect(SCHEMA).toMatch(/stripe_customer_id:\s*text\('stripe_customer_id'\)/);
    expect(SCHEMA).toMatch(/stripe_subscription_id:\s*text\('stripe_subscription_id'\)/);
  });

  it('mirrors signup_step (NOT NULL DEFAULT account per migration)', () => {
    expect(SCHEMA).toMatch(
      /signup_step:\s*text\('signup_step'\)\.default\('account'\)\.notNull\(\)/,
    );
  });

  it('mirrors signup_completed_at + accepted_terms_at + accepted_terms_version', () => {
    expect(SCHEMA).toMatch(/signup_completed_at:\s*timestamptz\('signup_completed_at'\)/);
    expect(SCHEMA).toMatch(/accepted_terms_at:\s*timestamptz\('accepted_terms_at'\)/);
    expect(SCHEMA).toMatch(/accepted_terms_version:\s*text\('accepted_terms_version'\)/);
  });

  it('mirrors abn_digits + billing_contact_email', () => {
    expect(SCHEMA).toMatch(/abn_digits:\s*text\('abn_digits'\)/);
    expect(SCHEMA).toMatch(/billing_contact_email:\s*text\('billing_contact_email'\)/);
  });

  it('mirrors pricing_tier (NOT NULL DEFAULT standard) + founding_cohort_position', () => {
    expect(SCHEMA).toMatch(
      /pricing_tier:\s*text\('pricing_tier'\)\.default\('standard'\)\.notNull\(\)/,
    );
    expect(SCHEMA).toMatch(/founding_cohort_position:\s*integer\('founding_cohort_position'\)/);
  });

  it('mirrors signing_authority_name + signing_authority_email + subscription_status + trial_ends_at', () => {
    expect(SCHEMA).toMatch(/signing_authority_name:\s*text\('signing_authority_name'\)/);
    expect(SCHEMA).toMatch(/signing_authority_email:\s*text\('signing_authority_email'\)/);
    expect(SCHEMA).toMatch(/subscription_status:\s*text\('subscription_status'\)/);
    expect(SCHEMA).toMatch(/trial_ends_at:\s*timestamptz\('trial_ends_at'\)/);
  });
});

describe('Migration ↔ Drizzle ↔ webhook contract — every column the function INSERTs is mirrored in Drizzle', () => {
  it('every companies column written by provision_tenant_from_checkout exists in Drizzle schema', () => {
    // The function INSERTs into these columns. Each MUST appear in
    // src/db/schema.ts as a Drizzle column declaration. If a future
    // migration adds a new column to the INSERT, this test reminds
    // the developer to mirror it in Drizzle.
    const insertedColumns = [
      'name',
      'abn',
      'abn_digits',
      'contact_email',
      'billing_contact_email',
      'stripe_customer_id',
      'stripe_subscription_id',
      'pricing_tier',
      'signup_step',
      'accepted_terms_at',
      'is_active',
    ];
    for (const col of insertedColumns) {
      expect(
        SCHEMA,
        `Drizzle schema is missing companies.${col} which the migration INSERTs`,
      ).toMatch(new RegExp(`${col}:\\s*\\w`));
    }
  });
});
