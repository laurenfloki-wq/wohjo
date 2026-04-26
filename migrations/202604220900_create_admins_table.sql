-- GAP-A3-001 Option B — new admins table.
-- Maps auth.users → companies with a role. One row per (user, company);
-- a user may administer multiple companies by having multiple rows.
-- (Today, the application assumes one-company-per-user; the composite
-- PK allows future expansion without schema change.)

CREATE TABLE IF NOT EXISTS admins (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('director','payroll_officer','site_supervisor','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_admins_company_id ON admins(company_id);

-- Keep updated_at fresh.
CREATE OR REPLACE FUNCTION admins_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admins_updated_at ON admins;
CREATE TRIGGER admins_updated_at
  BEFORE UPDATE ON admins
  FOR EACH ROW
  EXECUTE FUNCTION admins_set_updated_at();

-- RLS: an authenticated user sees their own admins rows; inserts/updates/
-- deletes are service-role only (admin invite flow will run server-side).
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admins_self_select ON admins;
CREATE POLICY admins_self_select
  ON admins
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS admins_service_write ON admins;
CREATE POLICY admins_service_write
  ON admins
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
