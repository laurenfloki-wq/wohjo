-- D2 — reconcile companies billing columns to src/db/schema.ts (audit D2).
--
-- subscription_status, trial_ends_at, founding_cohort_position are declared in
-- the Drizzle schema and WRITTEN by the Stripe webhook handlers, but never
-- existed in prod. So onSubscriptionCreated (writes trial_ends_at) failed
-- fatally → Stripe got a 500 and retried forever, trial linkage was never
-- recorded; and the founding-cohort stamp failed silently. This is also the
-- prerequisite for D1: the entitlement gate reads subscription_status.
--
-- All nullable, no defaults (matches schema.ts) → drift-gate-safe (columns are
-- not a tracked dimension and no default is added).

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS subscription_status      text,
  ADD COLUMN IF NOT EXISTS trial_ends_at            timestamptz,
  ADD COLUMN IF NOT EXISTS founding_cohort_position integer;
