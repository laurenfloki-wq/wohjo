-- Add count_broken_chain_links() — a helper present in production
-- but never tracked via migration. chat-Claude's per-function
-- attestation against live production (2026-06-09) identified it
-- as the missing function in the rebuild's 11-function set (rebuild
-- had current_user_company_id which is dropped in the
-- 20260608000000 dashboard-drift migration).
--
-- Production attributes per chat-Claude name snapshot:
--   - LANGUAGE sql
--   - SECURITY DEFINER (prosecdef = true)
--   - search_path = 'public' or 'public, extensions' per the
--     SECURITY DEFINER hardening observation (out of scope here;
--     follow-up FORWARD migration to lock to empty/fully-qualified
--     is proposed in scripts/.116c/SHIPPABLE-LEDGER.md)
--
-- Body sourced from tests/integration-postgres/bootstrap.sql which
-- has been the canonical reference for this function across the
-- bulletproof suite. SECURITY DEFINER + SET search_path = 'public'
-- added to match the production attributes chat-Claude recorded.
--
-- This migration is APPROXIMATE pending byte-exact verification by
-- chat-Claude (paste pg_get_functiondef('public.count_broken_chain_links'::regprocedure)
-- into psql against prod, compare to the rebuild's emitted line).
-- If the body differs, this migration is the place to adjust.

CREATE OR REPLACE FUNCTION public.count_broken_chain_links()
RETURNS TABLE(n bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT count(*)::bigint
  FROM shift_events s
  WHERE s.previous_event_hash IS NOT NULL
    AND s.previous_event_hash <> '0000000000000000000000000000000000000000000000000000000000000000'
    AND NOT EXISTS (
      SELECT 1 FROM shift_events p WHERE p.event_hash = s.previous_event_hash
    );
$$;
