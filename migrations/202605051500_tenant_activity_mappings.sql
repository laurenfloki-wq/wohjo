-- ─────────────────────────────────────────────────────────────────
-- Monday Task M1 — MYOB AccountRight exporter substrate
-- ─────────────────────────────────────────────────────────────────
--
-- Authored:  Cowork, Monday 5 May 2026 (parallel hardening track)
-- Branch:    feature/myob-exporter (off 87677e1, NOT pushed)
-- For:       Mo (Dass Labour Hire) Mon 12 May pay run on MYOB
--            AccountRight Classic
-- Status:    DO NOT auto-apply. Lauren applies via Supabase SQL
--            Editor after substrate-DD review.
--
-- WHAT THIS MIGRATION ADDS
--
-- 1. tenant_activity_mappings table — per-tenant mapping from
--    FLOSTRUCTION's canonical category names (ordinary_hours,
--    overtime_1_5x, travel_allowance, etc.) to the customer's MYOB
--    Activity ID strings (e.g. CW2-ORD, CW2-OT15, TRAVEL).
--
--    Mo's MYOB instance has its own Activity ID names, configured
--    by his bookkeeper. The exporter reads this table to translate
--    each shift's category into the right MYOB token before writing
--    the export file.
--
-- 2. workers.myob_card_id — the worker's MYOB Card ID, used as the
--    Card ID column in the export. MYOB matches by Card ID (NOT by
--    Last Name) to avoid hyphen/spelling failures.
--
-- TENANT SCOPING INVARIANT
--
-- - tenant_activity_mappings.tenant_id is FK to companies(id) with
--   ON DELETE CASCADE. RLS policies (added below) ensure each tenant
--   reads ONLY its own mappings via service_role.
-- - workers.myob_card_id is added to existing workers table; the
--   existing tenant scoping (workers.company_id) flows through.
--
-- BACKWARDS COMPATIBILITY
--
-- - workers.myob_card_id is nullable. Existing workers (Joao, etc.)
--   continue to function. Workers without a card_id are skipped
--   from MYOB export with a surfaced warning (not silently dropped).
-- - tenant_activity_mappings starts empty. The exporter handles
--   missing mappings with a surfaced warning per shift category.
--
-- JOAO E2E SACRED ZONE
--
-- - workers.myob_card_id IF NOT EXISTS, default NULL — Joao's row
--   unaffected.
-- - shift_events / shifts / sites / supervisors UNTOUCHED.
-- - This migration is additive only. Re-runnable.

BEGIN;

-- ─── Step 1 — tenant_activity_mappings table
CREATE TABLE IF NOT EXISTS tenant_activity_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  flostruction_category TEXT NOT NULL,
  myob_activity_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, flostruction_category)
);

CREATE INDEX IF NOT EXISTS idx_tenant_activity_mappings_tenant
  ON tenant_activity_mappings(tenant_id);

COMMENT ON TABLE tenant_activity_mappings IS
  'Per-tenant mapping from FLOSTRUCTION canonical category names '
  '(ordinary_hours, overtime_1_5x, travel_allowance, etc.) to '
  'customer-specific MYOB Activity ID strings. Read by '
  '/api/exports/myob during pay-period export to translate each '
  'shift category into the customer''s MYOB token. Each tenant has '
  'its own row set; no cross-tenant data sharing.';

-- ─── Step 2 — RLS policies (canonical multi-tenant pattern)
ALTER TABLE tenant_activity_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_activity_mappings_service_all
  ON tenant_activity_mappings;
CREATE POLICY tenant_activity_mappings_service_all
  ON tenant_activity_mappings
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- (No per-tenant authenticated SELECT policy — tenant admins access
-- via the /admin/payroll-mapping route which uses service_role and
-- scopes by getCompanyIdForSession(). Same pattern as
-- tenant_activity_mappings' siblings: founding_leads, etc.)

-- ─── Step 3 — workers.myob_card_id column
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS myob_card_id TEXT;

COMMENT ON COLUMN workers.myob_card_id IS
  'Worker''s MYOB AccountRight Card ID (e.g. *0001). Used as the '
  'Card ID column in MYOB timesheet exports — MYOB matches by '
  'Card ID NOT Last Name to avoid hyphen/spelling failures. '
  'NULL for workers not yet assigned a card; export skips those '
  'workers with a surfaced warning rather than silently dropping.';

-- ─── Step 4 — Sanity verification
DO $$
DECLARE
  v_table_exists boolean;
  v_column_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'tenant_activity_mappings'
  ) INTO v_table_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workers'
      AND column_name = 'myob_card_id'
  ) INTO v_column_exists;

  IF NOT v_table_exists THEN
    RAISE EXCEPTION 'tenant_activity_mappings table missing after migration';
  END IF;
  IF NOT v_column_exists THEN
    RAISE EXCEPTION 'workers.myob_card_id column missing after migration';
  END IF;

  RAISE NOTICE 'Migration 202605051500 verified: tenant_activity_mappings + workers.myob_card_id present.';
END $$;

COMMIT;

-- ─── Post-migration — Lauren-side activity mapping for Mo
--
-- After Mo's onboarding call, Lauren INSERTs Mo's MYOB Activity IDs
-- via the /admin/payroll-mapping page. Example:
--
--   INSERT INTO tenant_activity_mappings (tenant_id, flostruction_category, myob_activity_id) VALUES
--     ((SELECT id FROM companies WHERE name ILIKE '%dass%'), 'ordinary_hours', 'CW2-ORD'),
--     ((SELECT id FROM companies WHERE name ILIKE '%dass%'), 'overtime_1_5x',  'CW2-OT15'),
--     ((SELECT id FROM companies WHERE name ILIKE '%dass%'), 'travel_allowance', 'TRAVEL'),
--     ((SELECT id FROM companies WHERE name ILIKE '%dass%'), 'meal_allowance', 'MEAL'),
--     ((SELECT id FROM companies WHERE name ILIKE '%dass%'), 'inclement_weather_cw2', 'CW2-INCL'),
--     ((SELECT id FROM companies WHERE name ILIKE '%dass%'), 'multi_storey_allowance', 'CW2-MS'),
--     ((SELECT id FROM companies WHERE name ILIKE '%dass%'), 'rdo_deductions_cw2', 'CW2-RDO');
--
-- Mo overwrites these via the admin UI on his onboarding call.

-- ─── End of migration
