-- 20260615053603_widen_companies_pricing_tier_to_five_tiers
--
-- Bring companies_pricing_tier_valid into line with the canonical tier set.
-- Source of truth: src/lib/stripe/pricing.ts (PricingTier) and the
-- provision_tenant_from_checkout RPC, both of which already validate
-- founding|standard|growth|scale|enterprise. The CHECK constraint lagged at
-- ('founding','standard'), so a growth/scale/enterprise signup passed the Zod
-- schema and the RPC guard, then failed at the INSERT — rolling back tenant
-- provisioning for a paying customer.
--
-- Widening only: the new allowed set strictly contains the old, so no existing
-- row can be invalidated. Idempotent via DROP CONSTRAINT IF EXISTS. CHECK
-- constraints are not a #116c fingerprinted dimension, so this does not affect
-- drift-gate or full-graph-attestation.
--
-- Applied to production 2026-06-15 (ledger version 20260615053603); this file
-- captures the same change as committed source so prod == migration graph.

ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_pricing_tier_valid;
ALTER TABLE public.companies ADD CONSTRAINT companies_pricing_tier_valid
  CHECK (pricing_tier IS NULL OR pricing_tier IN ('founding','standard','growth','scale','enterprise'));
