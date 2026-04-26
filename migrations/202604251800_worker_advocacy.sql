-- Layer 3 — Worker advocacy infrastructure
-- 2026-04-25 evening · Bulletproofing sprint L3.1
--
-- Three protections that operate INDEPENDENTLY of the company-customer
-- relationship. Workers retain access to their own records and to a
-- direct escalation channel even after the company cancels, is
-- suspended, or fails to pay.
--
-- Founder direction (Layer 3 Jobs-standard):
-- "FLOSTRUCTION is not 'another SaaS.' It's the substrate workers
--  like Joao will rely on when they have nothing else."

BEGIN;

-- ── worker_disputes ────────────────────────────────────────────────
-- Direct escalation path for workers to raise concerns to FLOSMOSIS
-- without going through their employer. Examples: "My supervisor is
-- approving fewer hours than I worked", "My pay rate is wrong",
-- "I think my GPS data is being faked", "I left this company but
-- I need my records".

CREATE TABLE IF NOT EXISTS worker_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
  -- The worker's company at dispute-creation time. Persisted (not
  -- joined) because the worker may move between companies and we
  -- need the dispute history pinned to the original employment context.
  company_id uuid NOT NULL,
  dispute_type text NOT NULL CHECK (dispute_type IN (
    'hours_disputed',
    'pay_rate_wrong',
    'records_missing',
    'fake_gps_suspected',
    'supervisor_misconduct',
    'company_cancelled_records_access',
    'data_correction_request',
    'other'
  )),
  -- Worker's own narrative — free text. Required.
  narrative text NOT NULL CHECK (length(narrative) BETWEEN 10 AND 8000),
  -- Optional shift_id reference if the dispute is shift-specific
  related_shift_id uuid,
  status text NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',
    'under_review',
    'resolved',
    'escalated_external',  -- referred to Fair Work Ombudsman, OAIC, etc.
    'closed_no_action'
  )),
  -- Resolution notes added by FLOSMOSIS support. Visible to the worker.
  resolution_notes text,
  resolved_at timestamptz,
  resolved_by uuid,  -- auth.users.id of the FLOSMOSIS staff who resolved
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_disputes_worker_id ON worker_disputes(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_disputes_status ON worker_disputes(status) WHERE status IN ('open', 'under_review');
CREATE INDEX IF NOT EXISTS idx_worker_disputes_company_id ON worker_disputes(company_id);

-- updated_at maintenance
CREATE OR REPLACE FUNCTION worker_disputes_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS worker_disputes_updated_at ON worker_disputes;
CREATE TRIGGER worker_disputes_updated_at
  BEFORE UPDATE ON worker_disputes
  FOR EACH ROW EXECUTE FUNCTION worker_disputes_set_updated_at();

-- RLS: a worker sees only their own disputes; service role for
-- FLOSMOSIS staff to triage.
ALTER TABLE worker_disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS worker_disputes_self_select ON worker_disputes;
CREATE POLICY worker_disputes_self_select
  ON worker_disputes
  FOR SELECT
  USING (
    worker_id IN (
      SELECT id FROM workers WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS worker_disputes_self_insert ON worker_disputes;
CREATE POLICY worker_disputes_self_insert
  ON worker_disputes
  FOR INSERT
  WITH CHECK (
    worker_id IN (
      SELECT id FROM workers WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS worker_disputes_service_all ON worker_disputes;
CREATE POLICY worker_disputes_service_all
  ON worker_disputes
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── workers — add employment_end_date for 7-year retention window ──
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS employment_end_date date,
  ADD COLUMN IF NOT EXISTS records_retained_until date;

COMMENT ON COLUMN workers.employment_end_date IS
'Date the worker''s employment with this company ended. Set when '
'company deactivates the worker OR when company cancels '
'subscription. NULL while active.';

COMMENT ON COLUMN workers.records_retained_until IS
'Date FLOSMOSIS commits to retain this worker''s records. '
'Set to employment_end_date + 7 years per Australian Fair Work '
'Act 2009 record-keeping minimum. After this date, records may '
'be cold-archived but are NOT deleted (per CLAUDE.md rule 6).';

-- Function to compute records_retained_until from employment_end_date
CREATE OR REPLACE FUNCTION set_records_retained_until()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.employment_end_date IS NOT NULL
     AND (OLD.employment_end_date IS NULL
          OR NEW.employment_end_date <> OLD.employment_end_date) THEN
    NEW.records_retained_until := NEW.employment_end_date + INTERVAL '7 years';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workers_records_retained_until ON workers;
CREATE TRIGGER workers_records_retained_until
  BEFORE UPDATE ON workers
  FOR EACH ROW EXECUTE FUNCTION set_records_retained_until();

-- ── companies — add cancellation_state for post-cancellation worker
-- access policy ────────────────────────────────────────────────────
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS workers_retain_access_after_cancellation boolean
    NOT NULL DEFAULT true;

COMMENT ON COLUMN companies.workers_retain_access_after_cancellation IS
'Always true per founder direction 2026-04-25 (Layer 3.1 worker '
'advocacy). When the company is cancelled, the workers retain '
'access to their own records via the worker portal independent '
'of the company''s subscription state. The column exists for '
'future flexibility but is set true as a non-negotiable default.';

-- ── worker_record_exports — audit log of right-to-export usage ────
CREATE TABLE IF NOT EXISTS worker_record_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
  format text NOT NULL CHECK (format IN ('csv', 'json', 'pdf-receipts', 'all')),
  date_from date,
  date_to date,
  shift_count integer,
  ip_address text,
  user_agent text,
  exported_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_record_exports_worker_id
  ON worker_record_exports(worker_id);

ALTER TABLE worker_record_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS worker_record_exports_self_select ON worker_record_exports;
CREATE POLICY worker_record_exports_self_select
  ON worker_record_exports
  FOR SELECT
  USING (
    worker_id IN (SELECT id FROM workers WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS worker_record_exports_service_write ON worker_record_exports;
CREATE POLICY worker_record_exports_service_write
  ON worker_record_exports
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMIT;
