-- Bulletproofing sprint P1 — self-service onboarding fields.
-- 2026-04-25.
--
-- Adds the columns the onboarding wizard reads/writes plus the
-- billing surface fields populated by P2 (Stripe). Idempotent.

BEGIN;

-- ── Companies — add onboarding + billing columns ──────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS pricing_tier text NOT NULL DEFAULT 'standard'
    CHECK (pricing_tier IN ('founding','standard','growth','scale','enterprise')),
  ADD COLUMN IF NOT EXISTS founding_cohort_position integer,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS signup_step text NOT NULL DEFAULT 'account'
    CHECK (signup_step IN (
      'account','company','terms','billing','site','supervisor','workers','done'
    )),
  ADD COLUMN IF NOT EXISTS signup_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signing_authority_name text,
  ADD COLUMN IF NOT EXISTS signing_authority_email text,
  ADD COLUMN IF NOT EXISTS billing_contact_email text,
  ADD COLUMN IF NOT EXISTS accepted_terms_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_terms_version text;

-- founding_cohort_position is unique when set (sequential 1..N).
CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_founding_cohort_position
  ON public.companies (founding_cohort_position)
  WHERE founding_cohort_position IS NOT NULL;

-- ── ABN validation: keep raw + canonical (digits only) form ──────────
-- Existing column `abn` keeps the raw string; we add `abn_digits` as
-- the 11-digit canonical for matching.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS abn_digits text
    CHECK (abn_digits IS NULL OR abn_digits ~ '^[0-9]{11}$');

-- One ABN per active company.
CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_abn_digits_active
  ON public.companies (abn_digits)
  WHERE abn_digits IS NOT NULL AND is_active = true;

-- ── Founding-cohort allocator ────────────────────────────────────────
-- Atomic position-allocator. Returns NULL if the founding cohort is
-- already at capacity (20). Otherwise returns the next position.
-- Called once during the onboarding-terms step to assign founding flag.
CREATE OR REPLACE FUNCTION allocate_founding_cohort_position()
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  next_pos integer;
BEGIN
  SELECT COALESCE(MAX(founding_cohort_position), 0) + 1
    INTO next_pos
    FROM public.companies
    WHERE founding_cohort_position IS NOT NULL;
  IF next_pos > 20 THEN
    RETURN NULL;
  END IF;
  RETURN next_pos;
END;
$$;

REVOKE EXECUTE ON FUNCTION allocate_founding_cohort_position() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION allocate_founding_cohort_position() TO service_role;

-- ── Idempotency keys for Stripe webhook events ──────────────────────
-- Prevents double-processing when Stripe retries delivery.
CREATE TABLE IF NOT EXISTS stripe_event_log (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  payload_summary jsonb
);

ALTER TABLE stripe_event_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stripe_event_log_service_only ON stripe_event_log;
CREATE POLICY stripe_event_log_service_only
  ON stripe_event_log
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMIT;
