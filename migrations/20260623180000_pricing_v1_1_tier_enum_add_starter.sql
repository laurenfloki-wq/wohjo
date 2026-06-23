-- Pricing v1.1 conformance, step 2 — accept the 'starter' tier value.
--
-- v1.1's tiers are founding | starter | growth | enterprise. The live CHECK
-- allowed founding|standard|growth|scale|enterprise (the legacy flat-tier set).
-- This WIDENS it to add 'starter' so the DB can store v1.1 tiers. It does NOT
-- remove the legacy values ('standard','scale') yet — nothing references them in
-- data (the only company row is NULL-tier), but the full retire/retier lands
-- with the step-4 cutover once Stripe prices + checkout wiring exist, so removing
-- them now would only risk breaking a legacy code path for no benefit.
--
-- No data migration: 0 rows carry a non-NULL tier, so there is nothing to retier.
-- CHECK constraints are not tracked by the drift gate, so no drift-ref refresh.

ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_pricing_tier_valid;
ALTER TABLE public.companies ADD CONSTRAINT companies_pricing_tier_valid
  CHECK (
    pricing_tier IS NULL OR pricing_tier IN (
      'founding', 'starter', 'growth', 'enterprise',  -- v1.1
      'standard', 'scale'                              -- legacy, retired at cutover
    )
  );
