-- Saturday Shape A — Task A2: atomic founding-spot allocator
--
-- Postgres function allocate_founding_spot atomically reads + decrements
-- the founding_config.spots_remaining counter using FOR UPDATE row lock.
-- Returns the allocated spot number (1..20) on success, -1 if the
-- cohort is at capacity (caller redirects to waitlist).
--
-- Substrate-DD context: pre-fix /api/founding/route.ts used a
-- read-then-write pattern (SELECT spots_remaining → INSERT lead →
-- UPDATE spots_remaining). Two concurrent submissions could both read
-- spots_remaining=5, both compute spot_number=16, both insert leads
-- with the same spot_number. Atomic decrement prevents this.
--
-- Architectural overlap (NOT resolved by this migration; flagged for
-- Lauren's Sunday review): an existing function
-- allocate_founding_cohort_position() shipped in
-- migrations/202604250930_onboarding_company_fields.sql computes
-- positions from the companies.founding_cohort_position column. That
-- function is invoked by the onboarding wizard at the 'terms' step.
-- This new function operates on the founding_config.spots_remaining
-- counter and is invoked by /api/founding lead-capture and (Saturday
-- Task A3) the Stripe checkout webhook handler. The two functions
-- answer related but slightly different questions:
--   - allocate_founding_cohort_position() = "what position in the
--     companies-table-derived sequence?"
--   - allocate_founding_spot()              = "what spot number,
--     atomically decrementing the counter?"
-- Lauren reviews Sunday whether to (a) keep both with documented
-- separation, (b) collapse to one canonical mechanism, or (c)
-- harmonise their behaviour at a future stage.
--
-- DO NOT auto-apply. Lauren applies via Supabase SQL Editor on Sunday
-- after substrate-DD review.
--
-- Joao E2E test sacred zone: this migration touches PG functions only.
-- Joao's existing FLOSMOSIS Test tenant is unaffected — the function
-- is invoked only on new founding lead submissions / checkouts.

BEGIN;

DROP FUNCTION IF EXISTS public.allocate_founding_spot();

-- ─── allocate_founding_spot ──────────────────────────────────────────
-- Atomic decrement with FOR UPDATE row lock. Returns:
--   - integer 1..20 = allocated spot number (FOUNDING_COHORT_CAP per
--     src/lib/stripe/pricing.ts FOUNDING_COHORT_CAP = 20)
--   - integer -1    = cohort full; caller redirects to waitlist
--
-- Implementation notes:
--   - SELECT ... FOR UPDATE locks the founding_config row for the
--     duration of this transaction. Concurrent invocations serialise
--     on this lock; second caller sees the post-decrement counter
--     value.
--   - spots_remaining counts from 20 down to 0. spot_number is
--     `21 - spots_remaining` so the first allocated spot is 1, the
--     last is 20.
--   - founding_config table assumed to exist with a row
--     (key='spots_remaining', value text). If the table or row is
--     missing the function raises EXCEPTION rather than silently
--     allocating spot zero. (founding_config table substrate is
--     referenced in production by /api/founding/route.ts and
--     /app/founding/page.tsx; not currently in version-controlled
--     migrations — flagged for Lauren's substrate-DD review.)
--
-- Security: SECURITY INVOKER (default). Caller must be service_role
--           to write to founding_config given existing RLS. EXECUTE
--           is granted to service_role explicitly to make the
--           authorisation contract visible.

CREATE OR REPLACE FUNCTION public.allocate_founding_spot()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_remaining integer;
  v_spot_number integer;
BEGIN
  -- FOR UPDATE on the founding_config row serialises concurrent
  -- callers. The lock is released at COMMIT (caller's transaction
  -- boundary) — within a single function invocation PG holds the
  -- lock for the duration of the body.
  SELECT (value::integer)
    INTO v_remaining
    FROM public.founding_config
    WHERE key = 'spots_remaining'
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'allocate_founding_spot: founding_config row missing for key=spots_remaining';
  END IF;

  IF v_remaining <= 0 THEN
    RETURN -1;
  END IF;

  -- spots_remaining counts down from 20; spot_number counts up from 1.
  v_spot_number := 21 - v_remaining;

  UPDATE public.founding_config
    SET value = (v_remaining - 1)::text
    WHERE key = 'spots_remaining';

  RETURN v_spot_number;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.allocate_founding_spot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_founding_spot() TO service_role;

COMMIT;
