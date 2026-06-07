-- =====================================================================
-- PHASE 4 — Round 8 closures (atomic)
-- Closes: CRACK 128, 129, 130, 136, 137, 138, 140, 142, 143, 144, 146,
--         147, 150, 151, 152, 153, 154
-- =====================================================================

-- STEP 1: Convert NO_ACTION FKs to RESTRICT (CRACK 128, 129, 130) — 9 FKs

-- geofence_events
ALTER TABLE geofence_events DROP CONSTRAINT IF EXISTS geofence_events_worker_id_fkey;
ALTER TABLE geofence_events ADD CONSTRAINT geofence_events_worker_id_fkey
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE RESTRICT;

ALTER TABLE geofence_events DROP CONSTRAINT IF EXISTS geofence_events_site_id_fkey;
ALTER TABLE geofence_events ADD CONSTRAINT geofence_events_site_id_fkey
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT;

-- shift_events (4 FKs)
ALTER TABLE shift_events DROP CONSTRAINT IF EXISTS shift_events_worker_id_fkey;
ALTER TABLE shift_events ADD CONSTRAINT shift_events_worker_id_fkey
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE RESTRICT;

ALTER TABLE shift_events DROP CONSTRAINT IF EXISTS shift_events_site_id_fkey;
ALTER TABLE shift_events ADD CONSTRAINT shift_events_site_id_fkey
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT;

ALTER TABLE shift_events DROP CONSTRAINT IF EXISTS shift_events_company_id_fkey;
ALTER TABLE shift_events ADD CONSTRAINT shift_events_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;

ALTER TABLE shift_events DROP CONSTRAINT IF EXISTS shift_events_parent_shift_event_id_fkey;
ALTER TABLE shift_events ADD CONSTRAINT shift_events_parent_shift_event_id_fkey
  FOREIGN KEY (parent_shift_event_id) REFERENCES shift_events(id) ON DELETE RESTRICT;

-- shifts (3 FKs)
ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_worker_id_fkey;
ALTER TABLE shifts ADD CONSTRAINT shifts_worker_id_fkey
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE RESTRICT;

ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_site_id_fkey;
ALTER TABLE shifts ADD CONSTRAINT shifts_site_id_fkey
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT;

ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_company_id_fkey;
ALTER TABLE shifts ADD CONSTRAINT shifts_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;


-- STEP 2: Composite index for chain trigger perf (CRACK 136)
CREATE INDEX IF NOT EXISTS idx_shift_events_worker_created_at
  ON shift_events (worker_id, created_at DESC);


-- STEP 3: geofence_events lat/lng range CHECK (CRACK 137)
ALTER TABLE geofence_events ADD CONSTRAINT geofence_events_lat_range
  CHECK (lat BETWEEN -90 AND 90);
ALTER TABLE geofence_events ADD CONSTRAINT geofence_events_lng_range
  CHECK (lng BETWEEN -180 AND 180);


-- STEP 4: shift_events event_type whitelist (CRACK 138)
ALTER TABLE shift_events ADD CONSTRAINT shift_events_event_type_whitelist
  CHECK (event_type IN (
    'START_EVENT', 'END_EVENT', 'SHIFT_COMMIT',
    'SUPERVISOR_APPROVAL', 'DISPUTE_RAISED', 'PAYROLL_APPROVAL',
    'CORRECTION', 'BUG_CORRECTION', 'SUPERVISOR_RE_APPROVAL'
  ));


-- STEP 5: event_data shape CHECK (CRACK 153)
ALTER TABLE shift_events ADD CONSTRAINT shift_events_event_data_shape
  CHECK (
    event_type NOT IN ('SUPERVISOR_APPROVAL', 'DISPUTE_RAISED', 'SHIFT_COMMIT', 'PAYROLL_APPROVAL')
    OR event_data ? 'shift_id'
  );


-- STEP 6: shifts non-negative numerics (CRACK 142, 152)
ALTER TABLE shifts ADD CONSTRAINT shifts_total_hours_nonneg
  CHECK (total_hours IS NULL OR total_hours >= 0);
ALTER TABLE shifts ADD CONSTRAINT shifts_break_minutes_nonneg
  CHECK (break_minutes IS NULL OR break_minutes >= 0);


-- STEP 7: workers.pay_rate non-negative (CRACK 143)
ALTER TABLE workers ADD CONSTRAINT workers_pay_rate_nonneg
  CHECK (pay_rate IS NULL OR pay_rate >= 0);


-- STEP 8: exports pay_period order (CRACK 140)
ALTER TABLE exports ADD CONSTRAINT exports_pay_period_order
  CHECK (pay_period_end >= pay_period_start);


-- STEP 9: UNIQUE supervisors.verify_token (CRACK 150)
CREATE UNIQUE INDEX IF NOT EXISTS supervisors_verify_token_unique
  ON supervisors(verify_token) WHERE verify_token IS NOT NULL;


-- STEP 10: UNIQUE supervisors.supabase_user_id (CRACK 146)
CREATE UNIQUE INDEX IF NOT EXISTS supervisors_supabase_user_id_unique
  ON supervisors(supabase_user_id) WHERE supabase_user_id IS NOT NULL;


-- STEP 11: UNIQUE workers.employee_id (CRACK 151)
CREATE UNIQUE INDEX IF NOT EXISTS workers_employee_id_unique
  ON workers(employee_id) WHERE employee_id IS NOT NULL;


-- STEP 12: supervisors.pending_sms_approval_ids DEFAULT + NOT NULL (CRACK 154)
ALTER TABLE supervisors ALTER COLUMN pending_sms_approval_ids SET DEFAULT '{}';
ALTER TABLE supervisors ALTER COLUMN pending_sms_approval_ids SET NOT NULL;


-- STEP 13: Email format CHECKs (CRACK 144, 147)
ALTER TABLE workers ADD CONSTRAINT workers_email_format
  CHECK (email IS NULL OR email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
ALTER TABLE supervisors ADD CONSTRAINT supervisors_email_format
  CHECK (email IS NULL OR email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
ALTER TABLE companies ADD CONSTRAINT companies_contact_email_format
  CHECK (contact_email IS NULL OR contact_email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
ALTER TABLE companies ADD CONSTRAINT companies_billing_contact_email_format
  CHECK (billing_contact_email IS NULL OR billing_contact_email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');