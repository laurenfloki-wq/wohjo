-- ────────────────────────────────────────────────────────────────────
-- #116b GENESIS — pre-baseline schema reconstruction
-- ────────────────────────────────────────────────────────────────────
-- Production was scaffolded via Supabase dashboard before migration
-- discipline began. The supabase_migrations.schema_migrations table
-- starts at 20260506090427 ("baseline"); none of the 88 committed
-- migrations create the core public tables (companies, workers, sites,
-- shifts, supervisors, exports, shift_events, founding_leads).
--
-- This file is the genesis: it creates those tables in their
-- pre-baseline shape so an empty Postgres + this + the 88 reconciled
-- migrations reproduces the production schema. Stamped 00000000000000
-- so it sorts BEFORE every applied version.
--
-- Boundaries:
--   - This file does NOT modify the production database. Production
--     already has these tables (live). The genesis exists for repo
--     reproducibility only: `npm run replay` from a clean checkout.
--   - This file MUST NOT contain objects that any of the 88 migrations
--     creates without IF NOT EXISTS. Currently that is only
--     `export_packs` (created bare in m4e_export_packs_widening_buckets_rls).
--   - This file MUST NOT contain constraints any migration ADDs without
--     a preceding DROP IF EXISTS. Audited via grep against migrations/.
--
-- Built empirically by iterating scripts/.116b/replay-loop.mjs against
-- this file + the 88. Each replay failure tells us what genesis has
-- wrong (extra columns trip ADD COLUMN, missing FK trips a later ADD
-- CONSTRAINT, etc.). The validation oracle is a schema diff between
-- a clean replay and production via the Supabase MCP.

-- ─── companies ──────────────────────────────────────────────────────
CREATE TABLE companies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  abn             text,
  contact_email   text NOT NULL,
  contact_phone   text,
  created_at      timestamptz DEFAULT now(),
  is_active       boolean DEFAULT true
);

-- ─── sites ──────────────────────────────────────────────────────────
CREATE TABLE sites (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                    text NOT NULL,
  address                 text,
  site_code               text,
  geofence_lat            numeric,
  geofence_lng            numeric,
  geofence_radius_metres  integer DEFAULT 200,
  is_active               boolean DEFAULT true,
  created_at              timestamptz DEFAULT now(),
  lat                     numeric,
  lng                     numeric,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- ─── workers ────────────────────────────────────────────────────────
CREATE TABLE workers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  first_name            text NOT NULL,
  last_name             text NOT NULL,
  phone                 text NOT NULL,
  email                 text,
  employee_id           text NOT NULL,
  pay_rate              numeric,
  award_classification  text,
  is_active             boolean DEFAULT true,
  created_at            timestamptz DEFAULT now(),
  myob_card_id          text
);

-- ─── supervisors ────────────────────────────────────────────────────
CREATE TABLE supervisors (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                      text NOT NULL,
  phone                     text NOT NULL,
  email                     text,
  supabase_user_id          uuid,
  site_ids                  uuid[],
  is_active                 boolean DEFAULT true,
  pending_sms_approval_ids  text[],
  last_batch_sms_date       date,
  verify_token              uuid DEFAULT gen_random_uuid()
);

-- ─── shifts ─────────────────────────────────────────────────────────
CREATE TABLE shifts (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  uuid,
  worker_id                   uuid,
  site_id                     uuid,
  shift_date                  date NOT NULL,
  start_time                  timestamptz NOT NULL,
  end_time                    timestamptz,
  break_minutes               integer DEFAULT 0,
  total_hours                 numeric,
  receipt_id                  text NOT NULL UNIQUE,
  status                      text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','IN_PROGRESS','SUBMITTED','SUPERVISOR_APPROVED','PAYROLL_APPROVED','EXPORTED','DISPUTED','ADJUSTED')),
  confidence_score            integer DEFAULT 50,
  anomaly_flags               jsonb DEFAULT '[]'::jsonb,
  supervisor_approved_by      uuid,
  supervisor_approved_at      timestamptz,
  payroll_approved_by         uuid,
  payroll_approved_at         timestamptz,
  export_id                   uuid,
  worker_note                 text,
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now(),
  geofence_detected_at        timestamptz,
  geofence_lat                numeric,
  geofence_lng                numeric,
  geofence_accuracy_metres    integer,
  geofence_confidence         text
    CHECK (geofence_confidence IN ('HIGH','MEDIUM','LOW')),
  worker_confirmed_start_at   timestamptz,
  start_time_source           text NOT NULL DEFAULT 'MANUAL'
    CHECK (start_time_source IN ('GEOFENCE_CONFIRMED','GEOFENCE_ADJUSTED','MANUAL'))
);

-- ─── shift_events ───────────────────────────────────────────────────
CREATE TABLE shift_events (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               uuid,
  worker_id                uuid,
  site_id                  uuid,
  event_type               text NOT NULL,
  event_data               jsonb NOT NULL DEFAULT '{}'::jsonb,
  device_metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  gps_lat                  numeric,
  gps_lng                  numeric,
  gps_accuracy_metres      numeric,
  event_hash               text NOT NULL,
  previous_event_hash      text,
  created_at               timestamptz DEFAULT now(),
  created_by               text NOT NULL
);

-- ─── exports ────────────────────────────────────────────────────────
CREATE TABLE exports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid,
  pay_period_start  date,
  pay_period_end    date,
  export_target     text,
  shift_ids         uuid[],
  total_shifts      integer,
  total_hours       numeric,
  file_hash         text,
  exported_by       uuid,
  exported_at       timestamptz,
  audit_pack_url    text
);

-- ─── founding_config (RLS referenced by crack_209 before 20260512031949 CREATEs it) ──
CREATE TABLE founding_config (
  key   text PRIMARY KEY,
  value text
);

-- ─── admin_access_log (RLS referenced by crack_206 before 20260512031924 CREATEs it) ──
CREATE TABLE admin_access_log (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id        uuid NOT NULL,
  customer_id_accessed uuid,
  resource_type        text NOT NULL,
  resource_id          uuid,
  action               text NOT NULL
    CHECK (action IN ('read','export','impersonate','delete','update','alert','other')),
  "timestamp"          timestamptz NOT NULL DEFAULT now(),
  source_ip            text,
  reason_code          text
);

-- ─── geofence_events (company_id added by phase_2) ─────────────────
CREATE TABLE geofence_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id           uuid NOT NULL,
  site_id             uuid NOT NULL,
  detected_at         timestamptz NOT NULL,
  lat                 numeric NOT NULL,
  lng                 numeric NOT NULL,
  accuracy_metres     integer NOT NULL,
  confidence          text NOT NULL
    CHECK (confidence IN ('HIGH','MEDIUM','LOW')),
  synced_from_offline boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ─── tenant_activity_mappings (FK added by phase_2) ────────────────
-- Created by repo file 202605051500_tenant_activity_mappings.sql but
-- phase_2 (20260507034128) ALTERs it BEFORE that file runs. Genesis
-- provides the table; the later CREATE IF NOT EXISTS is a no-op.
CREATE TABLE tenant_activity_mappings (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL,
  flostruction_category  text NOT NULL,
  myob_activity_id       text NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, flostruction_category)
);

-- ─── founding_leads (dropped by crack_175; needed by baseline #1) ───
CREATE TABLE founding_leads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name  text,
  phone         text NOT NULL,
  created_at    timestamptz DEFAULT now()
);

CREATE POLICY anon_insert_founding_leads ON founding_leads
  FOR INSERT TO anon WITH CHECK (true);
ALTER TABLE founding_leads ENABLE ROW LEVEL SECURITY;

-- ─── pre-baseline RPCs the baseline migration REVOKEs on ────────────
-- baseline #1 (20260506090427) calls REVOKE EXECUTE on these. PGlite
-- needs them to exist or the REVOKE no-ops with a warning (not an
-- error). To be defensive, create harmless stubs that match the
-- signature. The 88 will REPLACE these with the real definitions.
CREATE OR REPLACE FUNCTION public.provision_tenant_from_checkout(
  text, text, text, text, text, text, jsonb, uuid
) RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000000'::uuid $$;

CREATE OR REPLACE FUNCTION public.allocate_founding_spot()
  RETURNS void LANGUAGE sql AS $$ SELECT NULL::void $$;

-- webhook_idempotency is created by A2-webhook-idempotency.sql
-- (which runs first in the lexical sort, before the dated migrations).
-- No forward declaration needed here.
