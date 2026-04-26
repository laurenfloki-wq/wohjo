-- Layer 2.1 — Worker sign-in anomaly detection
-- 2026-04-25 · Bulletproofing sprint L2.1 (build chunk 2 of 3)
--
-- Three patterns flagged on every successful worker sign-in:
--
--   NEW_DEVICE_SIGN_IN          — fingerprint never seen for this worker.
--   IMPOSSIBLE_TRAVEL_SIGN_IN   — sign-in location implausibly far from
--                                  the prior sign-in within 2 hours.
--                                  In Phase 1 the heuristic is "country
--                                  changed within 2 hours" because
--                                  Vercel only gives us city-resolution
--                                  geolocation reliably.
--   OFF_HOURS_SIGN_IN           — sign-in hour-of-day >4h from the
--                                  worker's 30-day modal sign-in hour.
--
-- Flags are written to worker_sign_in_log.flags (text[]). When any
-- flag is raised, the bootstrap-worker route emits an email to the
-- worker's primary-site supervisor: "Sign-in detected for [worker
-- first name] from [country/device descriptor]. Please confirm with
-- the worker." This is informational; the sign-in still succeeds
-- (the auth happened at Supabase, not here — this layer observes,
-- doesn't gate).

BEGIN;

-- ── worker_device_fingerprints ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_device_fingerprints (
  worker_id     uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  -- sha256(UA || screen || tz || lang || phone-hint).
  -- The actual UA string is NOT stored — only its hash. Privacy-
  -- preserving identification.
  fingerprint   text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  -- Best-effort country at first observation (for the supervisor
  -- notification copy). Phase-1 uses Vercel's IP-country header.
  ip_country    text,
  -- A short, worker-readable label they'd recognise from the
  -- "where you've signed in from" UI: e.g., "Android phone from
  -- Sydney". Set only if Vercel city geolocation is available.
  device_label  text,
  PRIMARY KEY (worker_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_device_fp_worker_recency
  ON worker_device_fingerprints (worker_id, last_seen_at DESC);

-- ── worker_sign_in_log ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_sign_in_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id     uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  signed_in_at  timestamptz NOT NULL DEFAULT now(),
  fingerprint   text NOT NULL,
  -- Source IP at sign-in. inet so we can run network-based queries
  -- ("was this CIDR seen elsewhere recently?") if needed.
  ip_address    inet,
  ip_country    text,
  ip_city       text,
  -- Vercel-provided coordinates (city-resolution); approximate.
  -- Stored for future lat/lng impossible-travel; Phase-1 heuristic
  -- compares country only.
  ip_lat        numeric(9,6),
  ip_lng        numeric(9,6),
  -- Flags raised at this sign-in. Empty array = clean sign-in.
  flags         text[] NOT NULL DEFAULT '{}',
  -- Best-effort UA descriptor (truncated to 256 chars). Useful for
  -- the supervisor email and for forensics; not used for fingerprint
  -- computation (the fingerprint is a hash of more inputs than UA).
  user_agent    text
);

CREATE INDEX IF NOT EXISTS idx_signin_worker_time
  ON worker_sign_in_log (worker_id, signed_in_at DESC);

-- Quick lookup of "any flagged sign-ins for this worker in the last N days"
-- to support the supervisor's review UI without a sequential scan.
CREATE INDEX IF NOT EXISTS idx_signin_flagged
  ON worker_sign_in_log (worker_id, signed_in_at DESC)
  WHERE flags <> '{}';

-- ── RLS ─────────────────────────────────────────────────────────────
-- Workers can SELECT their own fingerprints + sign-in log (the
-- "where you've signed in from" UI). Only service-role server can
-- INSERT/UPDATE — no PostgREST writes from worker sessions.
ALTER TABLE worker_device_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_sign_in_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS worker_device_fp_self_select ON worker_device_fingerprints;
CREATE POLICY worker_device_fp_self_select
  ON worker_device_fingerprints
  FOR SELECT
  TO authenticated
  USING (
    worker_id IN (SELECT id FROM workers WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS worker_signin_log_self_select ON worker_sign_in_log;
CREATE POLICY worker_signin_log_self_select
  ON worker_sign_in_log
  FOR SELECT
  TO authenticated
  USING (
    worker_id IN (SELECT id FROM workers WHERE user_id = auth.uid())
  );

-- Supervisors with admin role for the worker's company can SELECT
-- the worker's flagged sign-ins (so the /verify dashboard can show
-- the flags). They cannot see the full sign-in history of every
-- worker — only flagged events. This is the minimum visibility for
-- the "please confirm with the worker" workflow.
DROP POLICY IF EXISTS worker_signin_log_supervisor_flagged ON worker_sign_in_log;
CREATE POLICY worker_signin_log_supervisor_flagged
  ON worker_sign_in_log
  FOR SELECT
  TO authenticated
  USING (
    flags <> '{}'
    AND worker_id IN (
      SELECT w.id
      FROM workers w
      JOIN admins a ON a.company_id = w.company_id
      WHERE a.user_id = auth.uid()
    )
  );

COMMIT;

-- ── Verification queries ────────────────────────────────────────────
-- 1. Tables exist + RLS enabled:
--    SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('worker_device_fingerprints', 'worker_sign_in_log');
-- 2. Indexes exist:
--    SELECT indexname FROM pg_indexes
--    WHERE tablename IN ('worker_device_fingerprints', 'worker_sign_in_log');
-- 3. Policies present:
--    SELECT polname, polrelid::regclass FROM pg_policy
--    WHERE polrelid::regclass::text IN
--    ('worker_device_fingerprints', 'worker_sign_in_log');
