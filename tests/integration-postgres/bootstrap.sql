-- ────────────────────────────────────────────────────────────────────
-- FLOSTRUCTION integration-postgres harness bootstrap
-- ────────────────────────────────────────────────────────────────────
-- Mirrors the live production substrate enough to run the 7 bulletproof
-- scenarios (a-g) against real Postgres semantics: CHECK constraints,
-- chain-integrity trigger, RLS policies, the NOT VALID post-cutover
-- constraint, the WLES v1.0 envelope guard, and the canonical anchor
-- functions. Updates to live constraint definitions MUST be mirrored
-- here in the same PR.

-- gen_random_uuid() is in core Postgres ≥13 (no pgcrypto needed).

-- Fake `auth` schema so RLS policies that reference auth.uid() can run.
-- Tests set `app.current_user_id` via SET LOCAL to simulate the caller.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
$$;

-- ─── Minimal tenant tables ────────────────────────────────────────
CREATE TABLE companies (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL
);

CREATE TABLE sites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id),
  name        text NOT NULL
);

CREATE TABLE workers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id),
  first_name    text NOT NULL,
  last_name     text NOT NULL,
  phone         text NOT NULL,
  email         text,
  employee_id   text NOT NULL,
  pay_rate      numeric,
  myob_card_id  text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admins (
  user_id    uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES companies(id),
  role       text NOT NULL CHECK (role IN ('director','payroll_officer','site_supervisor','viewer')),
  PRIMARY KEY (user_id, company_id)
);

CREATE TABLE shifts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES companies(id),
  worker_id            uuid REFERENCES workers(id),
  site_id              uuid REFERENCES sites(id),
  shift_date           date NOT NULL,
  start_time           timestamptz NOT NULL,
  end_time             timestamptz,
  break_minutes        integer DEFAULT 0,
  total_hours          numeric,
  receipt_id           text UNIQUE NOT NULL,
  status               text NOT NULL DEFAULT 'IN_PROGRESS'
    CHECK (status IN ('IN_PROGRESS','SUBMITTED','SUPERVISOR_APPROVED','PAYROLL_APPROVED','EXPORTED','DISPUTED','ADJUSTED')),
  confidence_score     integer DEFAULT 50,
  anomaly_flags        jsonb DEFAULT '[]'::jsonb,
  export_id            uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ─── shift_events with full CHECK + trigger surface ───────────────
CREATE TABLE shift_events (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             uuid NOT NULL REFERENCES companies(id),
  worker_id              uuid REFERENCES workers(id),
  site_id                uuid REFERENCES sites(id),
  event_type             text NOT NULL,
  event_data             jsonb NOT NULL DEFAULT '{}'::jsonb,
  device_metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  gps_lat                numeric,
  gps_lng                numeric,
  gps_accuracy_metres    numeric,
  event_hash             text NOT NULL UNIQUE,
  previous_event_hash    text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             text NOT NULL,
  spec_version           text NOT NULL DEFAULT '0',
  wles_event             jsonb,
  parent_shift_event_id  uuid REFERENCES shift_events(id),
  correction_reason      text
);

ALTER TABLE shift_events ADD CONSTRAINT shift_events_event_hash_format
  CHECK (event_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE shift_events ADD CONSTRAINT shift_events_spec_version_check
  CHECK (spec_version = ANY (ARRAY['0'::text, '1.0'::text]));
ALTER TABLE shift_events ADD CONSTRAINT shift_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'START_EVENT','END_EVENT','SHIFT_COMMIT','SUPERVISOR_APPROVAL',
    'PAYROLL_APPROVAL','INTELLIGENCE_CLEAR','ANOMALY_FLAG',
    'DISPUTE_RAISED','EXPORT_RECORD','CORRECTION','BUG_CORRECTION',
    'SUPERVISOR_RE_APPROVAL','WORKER_DISPUTE_FILED','WORKER_CREATED',
    'X-FLOSMOSIS-SPEC_VERSION_MIGRATION','X-FLOSMOSIS-SPEC_VERSION_ANOMALY'
  ]));
-- shift_events_post_cutover_spec_v1 is added at the END of seed.sql,
-- AFTER the two forensic anomaly rows are inserted. NOT VALID skips
-- the back-scan over existing data but every subsequent INSERT/UPDATE
-- is still checked — so adding it inline here would block the seed.
ALTER TABLE shift_events ADD CONSTRAINT shift_events_v1_sealed
  CHECK (spec_version <> '1.0' OR wles_event IS NOT NULL);
ALTER TABLE shift_events ADD CONSTRAINT shift_events_correction_consistency_check
  CHECK (
    (event_type = ANY (ARRAY['CORRECTION'::text,'BUG_CORRECTION'::text,'SUPERVISOR_RE_APPROVAL'::text])
     AND parent_shift_event_id IS NOT NULL
     AND correction_reason IS NOT NULL
     AND length(correction_reason) > 0)
    OR
    (event_type <> ALL (ARRAY['CORRECTION'::text,'BUG_CORRECTION'::text,'SUPERVISOR_RE_APPROVAL'::text])
     AND parent_shift_event_id IS NULL
     AND correction_reason IS NULL)
  );
ALTER TABLE shift_events ADD CONSTRAINT shift_events_event_data_shape
  CHECK (
    event_type <> ALL (ARRAY['SUPERVISOR_APPROVAL'::text,'DISPUTE_RAISED'::text,'SHIFT_COMMIT'::text])
    OR event_data ? 'shift_id'
  );

-- Chain-integrity trigger (mirrors public.validate_shift_event_chain).
-- v1 events bypass the per-worker chain check (they chain per-company
-- via getV1ChainTail); v0 must chain off the prior v0 event for the
-- same worker, or NULL for START_EVENT.
CREATE OR REPLACE FUNCTION validate_shift_event_chain() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  expected_prev text;
BEGIN
  IF NEW.spec_version = '1.0' THEN
    RETURN NEW;
  END IF;
  IF NEW.event_type = 'START_EVENT' THEN
    IF NEW.previous_event_hash IS NOT NULL THEN
      RAISE EXCEPTION 'START_EVENT must have NULL previous_event_hash';
    END IF;
    RETURN NEW;
  END IF;
  SELECT event_hash INTO expected_prev
  FROM shift_events
  WHERE worker_id = NEW.worker_id AND spec_version = '0'
  ORDER BY created_at DESC LIMIT 1;
  IF NEW.previous_event_hash IS DISTINCT FROM expected_prev THEN
    RAISE EXCEPTION 'Chain integrity violation: expected previous_event_hash=%, got=%',
      expected_prev, NEW.previous_event_hash;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER shift_events_validate_chain
  BEFORE INSERT ON shift_events
  FOR EACH ROW EXECUTE FUNCTION validate_shift_event_chain();

CREATE OR REPLACE FUNCTION count_broken_chain_links() RETURNS TABLE(n bigint)
LANGUAGE sql AS $$
  SELECT count(*)::bigint
  FROM shift_events s
  WHERE s.previous_event_hash IS NOT NULL
    AND s.previous_event_hash <> '0000000000000000000000000000000000000000000000000000000000000000'
    AND NOT EXISTS (
      SELECT 1 FROM shift_events p WHERE p.event_hash = s.previous_event_hash
    );
$$;

-- ─── Phase 1 substrate (export_packs, exports widening, anchor) ────
CREATE TABLE exports (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  uuid NOT NULL REFERENCES companies(id),
  pay_period_start            date NOT NULL,
  pay_period_end              date NOT NULL,
  export_target               text NOT NULL,
  shift_ids                   uuid[] NOT NULL,
  total_shifts                integer NOT NULL,
  total_hours                 numeric NOT NULL,
  file_hash                   text NOT NULL,
  exported_by                 uuid NOT NULL,
  exported_at                 timestamptz NOT NULL DEFAULT now(),
  audit_pack_url              text,
  pack_id                     uuid,
  payroll_file_storage_path   text,
  payroll_file_mime           text
);

CREATE TABLE export_packs (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  export_id                   uuid REFERENCES exports(id) ON DELETE SET NULL,
  pack_format_version         text NOT NULL DEFAULT 'pack-v1.0',
  canonical_manifest_jsonb    jsonb NOT NULL,
  pack_fingerprint            text NOT NULL UNIQUE CHECK (pack_fingerprint ~ '^[0-9a-f]{64}$'),
  idempotency_key             text NOT NULL UNIQUE CHECK (idempotency_key ~ '^[0-9a-f]{64}$'),
  payroll_file_storage_path   text NOT NULL,
  payroll_file_mime           text NOT NULL,
  payroll_file_hash           text NOT NULL CHECK (payroll_file_hash ~ '^[0-9a-f]{64}$'),
  audit_pack_storage_path     text NOT NULL,
  audit_pack_mime             text NOT NULL DEFAULT 'application/pdf',
  audit_pack_hash             text NOT NULL CHECK (audit_pack_hash ~ '^[0-9a-f]{64}$'),
  generated_at                timestamptz NOT NULL DEFAULT now(),
  generated_by                uuid
);
ALTER TABLE exports ADD CONSTRAINT exports_pack_id_fk
  FOREIGN KEY (pack_id) REFERENCES export_packs(id) ON DELETE SET NULL;

ALTER TABLE export_packs ENABLE ROW LEVEL SECURITY;
-- pglite runs as `postgres` superuser which BYPASSES RLS entirely
-- (FORCE doesn't override BYPASSRLS). The harness creates a
-- non-superuser `app_user` role and the RLS scenarios SET ROLE to
-- it so the policy actually fires.
CREATE ROLE app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE ON SCHEMA auth TO app_user;
GRANT EXECUTE ON FUNCTION auth.uid() TO app_user;
-- Mirror of the WI-3 post-fix policy: auth.uid() wrapped in (select ...)
CREATE POLICY export_packs_select_company_admins
  ON export_packs
  FOR SELECT
  TO PUBLIC
  USING (
    EXISTS (
      SELECT 1 FROM exports e
      JOIN admins a ON a.company_id = e.company_id
      WHERE e.id = export_packs.export_id
        AND a.user_id = (select auth.uid())
    )
  );

CREATE TABLE substrate_anchors (
  id                    text PRIMARY KEY,
  scope_text            text NOT NULL,
  formula_text          text NOT NULL,
  expected_fingerprint  text NOT NULL,
  expected_count        integer NOT NULL CHECK (expected_count >= 0),
  bound_at              timestamptz NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_activity_mappings (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL,
  flostruction_category  text NOT NULL,
  myob_activity_id       text NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE worker_disputes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id           uuid NOT NULL REFERENCES workers(id),
  company_id          uuid NOT NULL REFERENCES companies(id),
  dispute_type        text NOT NULL,
  narrative           text NOT NULL CHECK (length(narrative) >= 10 AND length(narrative) <= 8000),
  related_shift_id    uuid REFERENCES shifts(id),
  status              text NOT NULL DEFAULT 'open',
  resolution_notes    text,
  resolved_at         timestamptz,
  resolved_by         uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
