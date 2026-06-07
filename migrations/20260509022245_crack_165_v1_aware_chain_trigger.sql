-- =============================================================================
-- MIGRATION CRACK 165 — make chain validation trigger v1-aware
-- Apply BEFORE setting WLES_V1_ENABLED=true in Vercel production.
--
-- Strategy: trigger defers to per-company chain integrity for spec_version='1.0'
-- events (delegating their integrity check to the chain-verify cron). v0/legacy
-- per-worker validation is preserved unchanged.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.validate_shift_event_chain()
RETURNS TRIGGER AS $func$
DECLARE
  expected_prev TEXT;
BEGIN
  -- WLES v1 events chain per-company (CRACK 104 design); their integrity is
  -- validated by the chain-verify cron at company scope, NOT by this per-worker
  -- trigger. Recognise v1 by spec_version column on the row.
  IF NEW.spec_version = '1.0' THEN
    RETURN NEW;
  END IF;

  -- v0 / legacy per-worker chain validation (unchanged from Migration 2.11)
  IF NEW.event_type = 'START_EVENT' THEN
    IF NEW.previous_event_hash IS NOT NULL THEN
      RAISE EXCEPTION 'START_EVENT must have NULL previous_event_hash';
    END IF;
    RETURN NEW;
  END IF;

  SELECT event_hash INTO expected_prev
  FROM shift_events
  WHERE worker_id = NEW.worker_id
    AND spec_version = '0'  -- only chain to v0 events; v1 events are a separate chain
  ORDER BY created_at DESC
  LIMIT 1;

  IF NEW.previous_event_hash IS DISTINCT FROM expected_prev THEN
    RAISE EXCEPTION 'Chain integrity violation: expected previous_event_hash=%, got=%',
      expected_prev, NEW.previous_event_hash;
  END IF;

  RETURN NEW;
END;
$func$ LANGUAGE plpgsql
SET search_path = pg_catalog, public;