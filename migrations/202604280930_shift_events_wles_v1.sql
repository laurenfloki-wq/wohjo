-- WLES v1.0 transition columns on shift_events (Annex v2.1 §1A(b))
-- 2026-04-28
--
-- Genesis migration 0000_mature_husk.sql created shift_events
-- with 14 columns. The WLES v1.0 work added code references to
-- spec_version + wles_event without a corresponding migration.
-- This migration closes that gap.
--
-- Idempotent (IF NOT EXISTS) so it's safe to re-run, or to apply
-- on top of any prior manual column additions made via the
-- Supabase dashboard.

BEGIN;

ALTER TABLE shift_events
  ADD COLUMN IF NOT EXISTS spec_version text NOT NULL DEFAULT '0';

ALTER TABLE shift_events
  ADD COLUMN IF NOT EXISTS wles_event jsonb;

-- Lock spec_version values to documented schema-version literals.
--   '0'   = legacy v0 events (current production, all existing rows)
--   '1.0' = WLES v1.0 sealed events (new path post-activation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname = 'shift_events_spec_version_check'
  ) THEN
    ALTER TABLE shift_events
      ADD CONSTRAINT shift_events_spec_version_check
      CHECK (spec_version IN ('0', '1.0'));
  END IF;
END $$;

COMMENT ON COLUMN shift_events.spec_version IS
  'WLES schema version. ''0''=legacy v0 events. ''1.0''=WLES v1.0 sealed events with canonical JSON in wles_event. Per Annex v2.1 §1A(b), v0 and v1.0 chains attach independent s 146 presumptions; verifier handles each on its own terms.';

COMMENT ON COLUMN shift_events.wles_event IS
  'Canonical WLES v1.0 sealed event JSON. NULL for legacy v0 events. Populated by /lib/wles/v1-chain.ts seal/chain helpers; verified by /api/cron/verify-hashes via /lib/wles/v1.verifyEvent.';

COMMIT;
