-- Saturday Shape A — Task A1: atomic tenant provisioning
--
-- Postgres function provision_tenant_from_checkout creates a companies
-- row + admins row in a single transactional unit. Idempotent on
-- stripe_customer_id — if the company already exists for that
-- customer, returns the existing id instead of creating a duplicate.
--
-- This function is the atomic substrate the Stripe checkout webhook
-- handler calls when a checkout.session.completed event lands. The
-- webhook handler itself is idempotent at a different layer
-- (stripe_event_log PK on event_id), so this function runs at most
-- once per checkout.session in normal operation, but the stripe_customer_id
-- idempotency guard is the safety belt for replay scenarios where the
-- handler is invoked again for an already-provisioned customer
-- (Stripe retry exhaustion + manual replay, or a failure after
-- companies-INSERT-success but before processed_at-UPDATE).
--
-- DO NOT auto-apply. Lauren applies via Supabase SQL Editor after
-- substrate-DD review on Sunday.
--
-- Joao E2E test sacred zone: this migration touches only PG functions
-- and adds NO data. Joao's existing FLOSMOSIS Test tenant
-- (company_id 00000000-1000-0000-0000-000000000001) is unaffected —
-- the function is invoked only on new checkout completions.

BEGIN;

-- Drop any prior version (idempotent dev-loop safety).
DROP FUNCTION IF EXISTS public.provision_tenant_from_checkout(
  text, text, text, text, text, text, jsonb, uuid
);

-- ─── provision_tenant_from_checkout ───────────────────────────────────
-- Creates companies + admins atomically. Idempotent on
-- stripe_customer_id.
--
-- Parameters:
--   p_stripe_customer_id    Stripe customer.id (cus_...) — idempotency key
--   p_stripe_subscription_id Stripe subscription.id (sub_...) — nullable
--                            for one-time checkouts (none in our model
--                            today, but the column accepts NULL)
--   p_email                  Billing contact email; written to both
--                            contact_email and billing_contact_email
--   p_company_name           Legal entity name from the signup form
--   p_abn_digits             11-digit canonical ABN; CHECK constraint
--                            on companies.abn_digits enforces format
--   p_pricing_tier           'founding' | 'standard' | 'growth' |
--                            'scale' | 'enterprise' (CHECK on column)
--   p_signup_metadata        jsonb pass-through; written to nothing
--                            today, present so future audit-trail
--                            additions don't require signature change
--   p_admin_user_id          auth.users.id of the registering admin —
--                            uuid of the user who completed checkout.
--                            Passed in by the caller (the webhook
--                            handler) so this function does NOT depend
--                            on auth.uid() (which is unavailable in
--                            SECURITY DEFINER context).
--
-- Returns: companies.id (uuid). On idempotency hit, returns the
--          existing company's id without modifying any row.
--
-- Security: SECURITY DEFINER. Invoked only by service-role webhook
--           handler. EXECUTE revoked from PUBLIC; granted only to
--           service_role.
--
-- Atomicity: a function body in PL/pgSQL is one transactional unit —
--            if either INSERT raises, both roll back. Companies'
--            admins-row commit is therefore guaranteed atomic with
--            the companies-row commit.

CREATE OR REPLACE FUNCTION public.provision_tenant_from_checkout(
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_email text,
  p_company_name text,
  p_abn_digits text,
  p_pricing_tier text,
  p_signup_metadata jsonb,
  p_admin_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  -- Argument validation. PG would catch some of these via column
  -- CHECK constraints, but failing fast with a clear message inside
  -- this function gives the webhook handler a more legible error
  -- payload to log + replay against later.
  IF p_stripe_customer_id IS NULL OR length(p_stripe_customer_id) = 0 THEN
    RAISE EXCEPTION 'provision_tenant_from_checkout: p_stripe_customer_id is required';
  END IF;
  IF p_email IS NULL OR length(p_email) = 0 THEN
    RAISE EXCEPTION 'provision_tenant_from_checkout: p_email is required';
  END IF;
  IF p_company_name IS NULL OR length(p_company_name) = 0 THEN
    RAISE EXCEPTION 'provision_tenant_from_checkout: p_company_name is required';
  END IF;
  IF p_pricing_tier IS NULL OR p_pricing_tier NOT IN
       ('founding','standard','growth','scale','enterprise') THEN
    RAISE EXCEPTION 'provision_tenant_from_checkout: p_pricing_tier must be one of founding|standard|growth|scale|enterprise';
  END IF;
  IF p_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'provision_tenant_from_checkout: p_admin_user_id is required';
  END IF;

  -- Idempotency guard. If the company already exists for this customer
  -- (Stripe webhook replay, manual re-invocation, etc.) return the
  -- existing id rather than create a duplicate.
  SELECT id INTO v_company_id
    FROM public.companies
    WHERE stripe_customer_id = p_stripe_customer_id;
  IF FOUND THEN
    RETURN v_company_id;
  END IF;

  -- Atomic create: companies row.
  -- signup_step is set to 'site' because the checkout flow has just
  -- completed billing — the next wizard step is to create the first
  -- site. Per src/lib/onboarding/state-machine.ts STEPS sequence:
  -- account → company → terms → billing → site → supervisor → workers.
  INSERT INTO public.companies (
    name,
    abn,
    abn_digits,
    contact_email,
    billing_contact_email,
    stripe_customer_id,
    stripe_subscription_id,
    pricing_tier,
    signup_step,
    accepted_terms_at,
    is_active
  ) VALUES (
    p_company_name,
    p_abn_digits,                    -- raw form acceptable for `abn`; canonical for matching is in abn_digits
    p_abn_digits,
    p_email,
    p_email,
    p_stripe_customer_id,
    p_stripe_subscription_id,
    p_pricing_tier,
    'site',                          -- next step in the wizard
    now(),                           -- terms accepted as part of checkout
    true
  )
  RETURNING id INTO v_company_id;

  -- Atomic create: admins row binding the auth user to the company
  -- with director role.
  INSERT INTO public.admins (
    user_id,
    company_id,
    role
  ) VALUES (
    p_admin_user_id,
    v_company_id,
    'director'
  );

  RETURN v_company_id;
END;
$$;

-- Lock down execution. SECURITY DEFINER means PG runs the function as
-- its owner (the migration applier) regardless of caller — but EXECUTE
-- privilege still gates who can invoke it. Only the service_role
-- (used by the Stripe webhook handler via createServiceClient()) may
-- invoke this.
REVOKE EXECUTE ON FUNCTION public.provision_tenant_from_checkout(
  text, text, text, text, text, text, jsonb, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.provision_tenant_from_checkout(
  text, text, text, text, text, text, jsonb, uuid
) TO service_role;

COMMIT;
