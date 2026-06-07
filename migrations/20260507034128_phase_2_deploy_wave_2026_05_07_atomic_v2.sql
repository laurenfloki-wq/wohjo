-- PRE-STEP 1 (Path B): RLS readiness — set company_id on auth users
UPDATE auth.users 
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) 
                        || '{"company_id": "00000000-1000-0000-0000-000000000001"}'::jsonb
WHERE id IN (
  '58e8bca1-9438-4997-8e57-92a195cfd995',
  'fb9110c8-bea7-4fc4-8a1e-7c3bc45c71c7'
);

DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM auth.users
  WHERE raw_app_meta_data ? 'company_id'
    AND raw_app_meta_data->>'company_id' = '00000000-1000-0000-0000-000000000001';
  IF v_count != 2 THEN
    RAISE EXCEPTION 'Pre-step 1 failed: expected 2 users with company_id claim, got %', v_count;
  END IF;
END $$;

-- PRE-STEP 2: Add updated_at columns where missing
ALTER TABLE companies   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE workers     ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE supervisors ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE sites       ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- PRE-STEP 3 (CRACK 125): geofence_events tenant column for RLS
ALTER TABLE geofence_events 
  ADD COLUMN company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT;
CREATE INDEX idx_geofence_events_company_id ON geofence_events(company_id);

-- TAG STEP (Option B): Flag historical SUPERVISOR_APPROVAL duplicates
UPDATE shift_events
SET event_data = event_data || jsonb_build_object(
  'historical_duplicate', true,
  'tagged_at', '2026-05-07',
  'tagged_reason', 'CRACK 72 retry duplicates - Option B canonical = newest per shift_id'
)
WHERE event_type = 'SUPERVISOR_APPROVAL'
  AND id NOT IN (
    SELECT DISTINCT ON (event_data->>'shift_id') id
    FROM shift_events
    WHERE event_type = 'SUPERVISOR_APPROVAL'
    ORDER BY event_data->>'shift_id', created_at DESC
  );

DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM shift_events
  WHERE event_type = 'SUPERVISOR_APPROVAL'
    AND event_data ? 'historical_duplicate';
  IF v_count != 6 THEN
    RAISE EXCEPTION 'Tag step failed: expected 6 historical_duplicate flags, got %', v_count;
  END IF;
END $$;

-- MIGRATION 2.1 — companies_schema_migration (CRACK 59)
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS abn_digits TEXT GENERATED ALWAYS AS (regexp_replace(abn, '[^0-9]', '', 'g')) STORED,
  ADD COLUMN IF NOT EXISTS billing_contact_email TEXT,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS pricing_tier TEXT,
  ADD COLUMN IF NOT EXISTS signup_step TEXT,
  ADD COLUMN IF NOT EXISTS accepted_terms_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS companies_stripe_customer_id_unique
  ON companies(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS companies_stripe_subscription_id_unique
  ON companies(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

ALTER TABLE companies ADD CONSTRAINT companies_pricing_tier_valid
  CHECK (pricing_tier IS NULL OR pricing_tier IN ('founding', 'standard'));

-- MIGRATION 2.2 — UNIQUE constraints (CRACK 92, 93, 94)
DO $$
BEGIN
  IF EXISTS (SELECT phone FROM workers WHERE is_active = true GROUP BY phone HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Workers active phone duplicates detected — abort';
  END IF;
  IF EXISTS (SELECT phone FROM supervisors WHERE is_active = true GROUP BY phone HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Supervisors active phone duplicates detected — abort';
  END IF;
  IF EXISTS (SELECT event_hash FROM shift_events WHERE event_hash IS NOT NULL GROUP BY event_hash HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'shift_events event_hash duplicates detected — abort';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS workers_phone_active_unique
  ON workers(phone) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS supervisors_phone_active_unique
  ON supervisors(phone) WHERE is_active = true;

ALTER TABLE shift_events ADD CONSTRAINT shift_events_event_hash_unique UNIQUE (event_hash);
ALTER TABLE shift_events ADD CONSTRAINT shift_events_event_hash_format
  CHECK (event_hash ~ '^[0-9a-f]{64}$');

-- MIGRATION 2.3 (MODIFIED) — partial UNIQUE indexes with historical_duplicate filter (CRACK 72)
CREATE UNIQUE INDEX IF NOT EXISTS shift_events_supervisor_approval_unique
  ON shift_events ((event_data->>'shift_id'))
  WHERE event_type = 'SUPERVISOR_APPROVAL' AND NOT (event_data ? 'historical_duplicate');
CREATE UNIQUE INDEX IF NOT EXISTS shift_events_dispute_raised_unique
  ON shift_events ((event_data->>'shift_id'))
  WHERE event_type = 'DISPUTE_RAISED' AND NOT (event_data ? 'historical_duplicate');
CREATE UNIQUE INDEX IF NOT EXISTS shift_events_shift_commit_unique
  ON shift_events ((event_data->>'shift_id'))
  WHERE event_type = 'SHIFT_COMMIT' AND NOT (event_data ? 'historical_duplicate');
CREATE UNIQUE INDEX IF NOT EXISTS shift_events_payroll_approval_unique
  ON shift_events ((event_data->>'shift_id'))
  WHERE event_type = 'PAYROLL_APPROVAL' AND NOT (event_data ? 'historical_duplicate');

-- MIGRATION 2.4 — status state machine + transition trigger (CRACK 79, 84)
ALTER TABLE shifts ADD CONSTRAINT shifts_status_valid CHECK (
  status IN ('OPEN', 'IN_PROGRESS', 'SUBMITTED', 'SUPERVISOR_APPROVED', 'PAYROLL_APPROVED', 'EXPORTED', 'DISPUTED')
);

CREATE OR REPLACE FUNCTION enforce_shift_status_transitions()
RETURNS TRIGGER AS $func$
BEGIN
  IF OLD.status = 'OPEN' AND NEW.status IN ('IN_PROGRESS', 'OPEN') THEN RETURN NEW; END IF;
  IF OLD.status = 'IN_PROGRESS' AND NEW.status IN ('SUBMITTED', 'IN_PROGRESS') THEN RETURN NEW; END IF;
  IF OLD.status = 'SUBMITTED' AND NEW.status IN ('SUPERVISOR_APPROVED', 'DISPUTED', 'SUBMITTED') THEN RETURN NEW; END IF;
  IF OLD.status = 'SUPERVISOR_APPROVED' AND NEW.status IN ('PAYROLL_APPROVED', 'DISPUTED', 'SUPERVISOR_APPROVED') THEN RETURN NEW; END IF;
  IF OLD.status = 'PAYROLL_APPROVED' AND NEW.status IN ('EXPORTED', 'PAYROLL_APPROVED') THEN RETURN NEW; END IF;
  IF OLD.status = 'EXPORTED' AND NEW.status = 'EXPORTED' THEN RETURN NEW; END IF;
  IF OLD.status = 'DISPUTED' AND NEW.status IN ('SUPERVISOR_APPROVED', 'DISPUTED') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Invalid shift status transition: % -> %', OLD.status, NEW.status;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shifts_enforce_status_transitions ON shifts;
CREATE TRIGGER shifts_enforce_status_transitions
  BEFORE UPDATE OF status ON shifts
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION enforce_shift_status_transitions();

-- MIGRATION 2.5 — RLS policies on 8 tables (CRACK 1)
DROP POLICY IF EXISTS service_role_full_access ON companies;
CREATE POLICY service_role_full_access ON companies AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS authenticated_select_own_company ON companies;
CREATE POLICY authenticated_select_own_company ON companies AS PERMISSIVE FOR SELECT TO authenticated
  USING (id = ((auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid));

DROP POLICY IF EXISTS service_role_full_access ON exports;
CREATE POLICY service_role_full_access ON exports AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS authenticated_select_own_company ON exports;
CREATE POLICY authenticated_select_own_company ON exports AS PERMISSIVE FOR SELECT TO authenticated
  USING (company_id = ((auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid));

DROP POLICY IF EXISTS service_role_full_access ON geofence_events;
CREATE POLICY service_role_full_access ON geofence_events AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS authenticated_select_own_company ON geofence_events;
CREATE POLICY authenticated_select_own_company ON geofence_events AS PERMISSIVE FOR SELECT TO authenticated
  USING (company_id = ((auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid));

DROP POLICY IF EXISTS service_role_full_access ON shift_events;
CREATE POLICY service_role_full_access ON shift_events AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS authenticated_select_own_company ON shift_events;
CREATE POLICY authenticated_select_own_company ON shift_events AS PERMISSIVE FOR SELECT TO authenticated
  USING (company_id = ((auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid));

DROP POLICY IF EXISTS service_role_full_access ON shifts;
CREATE POLICY service_role_full_access ON shifts AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS authenticated_select_own_company ON shifts;
CREATE POLICY authenticated_select_own_company ON shifts AS PERMISSIVE FOR SELECT TO authenticated
  USING (company_id = ((auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid));

DROP POLICY IF EXISTS service_role_full_access ON sites;
CREATE POLICY service_role_full_access ON sites AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS authenticated_select_own_company ON sites;
CREATE POLICY authenticated_select_own_company ON sites AS PERMISSIVE FOR SELECT TO authenticated
  USING (company_id = ((auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid));

DROP POLICY IF EXISTS service_role_full_access ON supervisors;
CREATE POLICY service_role_full_access ON supervisors AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS authenticated_select_own_company ON supervisors;
CREATE POLICY authenticated_select_own_company ON supervisors AS PERMISSIVE FOR SELECT TO authenticated
  USING (company_id = ((auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid));

DROP POLICY IF EXISTS service_role_full_access ON workers;
CREATE POLICY service_role_full_access ON workers AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS authenticated_select_own_company ON workers;
CREATE POLICY authenticated_select_own_company ON workers AS PERMISSIVE FOR SELECT TO authenticated
  USING (company_id = ((auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid));

-- MIGRATION 2.6 — NOT NULL company_id on 5 tables
ALTER TABLE shifts        ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE shift_events  ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE workers       ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE supervisors   ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE sites         ALTER COLUMN company_id SET NOT NULL;

-- MIGRATION 2.7 — performance indexes
CREATE INDEX IF NOT EXISTS idx_supervisors_phone ON supervisors(phone);
CREATE INDEX IF NOT EXISTS idx_workers_phone ON workers(phone);
CREATE INDEX IF NOT EXISTS idx_shifts_worker_id ON shifts(worker_id);
CREATE INDEX IF NOT EXISTS idx_shifts_company_id ON shifts(company_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
CREATE INDEX IF NOT EXISTS idx_shift_events_event_type ON shift_events(event_type);
CREATE INDEX IF NOT EXISTS idx_shift_events_worker_id ON shift_events(worker_id);
CREATE INDEX IF NOT EXISTS idx_shift_events_company_id ON shift_events(company_id);
CREATE INDEX IF NOT EXISTS idx_shift_events_created_at ON shift_events(created_at DESC);

-- MIGRATION 2.8 — FK supervisor_approved_by
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'shifts_supervisor_approved_by_fkey'
      AND conrelid = 'public.shifts'::regclass
  ) THEN
    ALTER TABLE shifts ADD CONSTRAINT shifts_supervisor_approved_by_fkey
      FOREIGN KEY (supervisor_approved_by) REFERENCES supervisors(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- MIGRATION 2.9 — tenant_activity_mappings FK RESTRICT (CRACK 91)
ALTER TABLE tenant_activity_mappings DROP CONSTRAINT IF EXISTS tenant_activity_mappings_tenant_id_fkey;
ALTER TABLE tenant_activity_mappings ADD CONSTRAINT tenant_activity_mappings_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES companies(id) ON DELETE RESTRICT;

-- MIGRATION 2.10 — exports NOT NULL (CRACK 88)
ALTER TABLE exports
  ALTER COLUMN company_id SET NOT NULL,
  ALTER COLUMN pay_period_start SET NOT NULL,
  ALTER COLUMN pay_period_end SET NOT NULL,
  ALTER COLUMN export_target SET NOT NULL,
  ALTER COLUMN shift_ids SET NOT NULL,
  ALTER COLUMN total_shifts SET NOT NULL,
  ALTER COLUMN total_hours SET NOT NULL,
  ALTER COLUMN file_hash SET NOT NULL,
  ALTER COLUMN exported_by SET NOT NULL;

ALTER TABLE exports ALTER COLUMN exported_at SET DEFAULT now();
ALTER TABLE exports ALTER COLUMN exported_at SET NOT NULL;

-- MIGRATION 2.11 — event chain validation trigger (CRACK 89)
CREATE OR REPLACE FUNCTION validate_shift_event_chain()
RETURNS TRIGGER AS $func$
DECLARE expected_prev TEXT;
BEGIN
  IF NEW.event_type = 'START_EVENT' THEN
    IF NEW.previous_event_hash IS NOT NULL THEN
      RAISE EXCEPTION 'START_EVENT must have NULL previous_event_hash';
    END IF;
    RETURN NEW;
  END IF;
  SELECT event_hash INTO expected_prev FROM shift_events
    WHERE worker_id = NEW.worker_id ORDER BY created_at DESC LIMIT 1;
  IF NEW.previous_event_hash IS DISTINCT FROM expected_prev THEN
    RAISE EXCEPTION 'Chain integrity violation: expected previous_event_hash=%, got=%',
      expected_prev, NEW.previous_event_hash;
  END IF;
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shift_events_validate_chain ON shift_events;
CREATE TRIGGER shift_events_validate_chain BEFORE INSERT ON shift_events
  FOR EACH ROW EXECUTE FUNCTION validate_shift_event_chain();

-- MIGRATION 2.12 — updated_at triggers on 5 tables
CREATE OR REPLACE FUNCTION set_updated_at_now()
RETURNS TRIGGER AS $func$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$func$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['shifts','workers','supervisors','sites','companies'])
  LOOP
    EXECUTE format($f$
      DROP TRIGGER IF EXISTS %I_set_updated_at ON %I;
      CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I
        FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();
    $f$, t, t, t, t);
  END LOOP;
END $$;

-- MIGRATION 2.13 — default privileges revoke (CRACK 90)
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;