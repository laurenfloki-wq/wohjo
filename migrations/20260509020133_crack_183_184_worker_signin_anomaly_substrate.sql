BEGIN;

CREATE TABLE IF NOT EXISTS worker_device_fingerprints (
  worker_id     uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  fingerprint   text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  ip_country    text,
  device_label  text,
  PRIMARY KEY (worker_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_device_fp_worker_recency
  ON worker_device_fingerprints (worker_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS worker_sign_in_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id     uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  signed_in_at  timestamptz NOT NULL DEFAULT now(),
  fingerprint   text NOT NULL,
  ip_address    inet,
  ip_country    text,
  ip_city       text,
  ip_lat        numeric(9,6),
  ip_lng        numeric(9,6),
  flags         text[] NOT NULL DEFAULT '{}',
  user_agent    text
);

CREATE INDEX IF NOT EXISTS idx_signin_worker_time
  ON worker_sign_in_log (worker_id, signed_in_at DESC);

CREATE INDEX IF NOT EXISTS idx_signin_flagged
  ON worker_sign_in_log (worker_id, signed_in_at DESC)
  WHERE flags <> '{}';

ALTER TABLE worker_device_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_sign_in_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS worker_device_fp_self_select ON worker_device_fingerprints;
CREATE POLICY worker_device_fp_self_select
  ON worker_device_fingerprints
  FOR SELECT TO authenticated
  USING (worker_id IN (SELECT id FROM workers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS worker_signin_log_self_select ON worker_sign_in_log;
CREATE POLICY worker_signin_log_self_select
  ON worker_sign_in_log
  FOR SELECT TO authenticated
  USING (worker_id IN (SELECT id FROM workers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS worker_signin_log_supervisor_flagged ON worker_sign_in_log;
CREATE POLICY worker_signin_log_supervisor_flagged
  ON worker_sign_in_log
  FOR SELECT TO authenticated
  USING (
    flags <> '{}'
    AND worker_id IN (
      SELECT w.id FROM workers w
      JOIN admins a ON a.company_id = w.company_id
      WHERE a.user_id = auth.uid()
    )
  );

COMMIT;