-- CRACK 195: create worker_disputes + RLS + trigger + supporting column ALTERs
-- Schema matches src/app/api/worker/disputes/new/route.ts insert shape exactly.
-- Source: 202604251800_worker_advocacy.sql (misleadingly named -- creates worker_disputes,
-- not worker_advocacy_requests; was never applied to production).
-- RLS pattern: (select auth.fn()) per CRACK 206 substrate-DD discipline.

-- Core table
CREATE TABLE IF NOT EXISTS worker_disputes (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id        uuid        NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
  company_id       uuid        NOT NULL,
  dispute_type     text        NOT NULL CHECK (dispute_type IN (
    'hours_disputed',
    'pay_rate_wrong',
    'records_missing',
    'fake_gps_suspected',
    'supervisor_misconduct',
    'company_cancelled_records_access',
    'data_correction_request',
    'other'
  )),
  narrative        text        NOT NULL CHECK (length(narrative) BETWEEN 10 AND 8000),
  related_shift_id uuid,
  status           text        NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'under_review', 'resolved', 'escalated_external', 'closed_no_action'
  )),
  resolution_notes text,
  resolved_at      timestamptz,
  resolved_by      uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_worker_disputes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_worker_disputes_updated_at ON worker_disputes;
CREATE TRIGGER trg_worker_disputes_updated_at
  BEFORE UPDATE ON worker_disputes
  FOR EACH ROW EXECUTE FUNCTION set_worker_disputes_updated_at();

-- Indexes (also satisfies advisor 0001 for worker_id FK)
CREATE INDEX IF NOT EXISTS idx_worker_disputes_worker_id  ON worker_disputes(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_disputes_company_id ON worker_disputes(company_id);
CREATE INDEX IF NOT EXISTS idx_worker_disputes_status
  ON worker_disputes(status)
  WHERE status NOT IN ('resolved', 'closed_no_action');

-- RLS
ALTER TABLE worker_disputes ENABLE ROW LEVEL SECURITY;

-- FLOSMOSIS support tooling: full access (optimized: (select auth.role()))
DROP POLICY IF EXISTS worker_disputes_service_all ON worker_disputes;
CREATE POLICY worker_disputes_service_all
  ON worker_disputes FOR ALL
  USING  ((select auth.role()) = 'service_role'::text)
  WITH CHECK ((select auth.role()) = 'service_role'::text);

-- Workers: read own disputes only (optimized: (select auth.role()) and (select auth.uid()))
DROP POLICY IF EXISTS worker_disputes_worker_read_own ON worker_disputes;
CREATE POLICY worker_disputes_worker_read_own
  ON worker_disputes FOR SELECT
  USING (
    (select auth.role()) = 'authenticated'::text
    AND worker_id IN (
      SELECT id FROM workers WHERE user_id = (select auth.uid())
    )
  );

-- Supporting column ALTERs
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS employment_end_date date;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;