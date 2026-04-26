-- Layer 2.1 — MFA on high-value worker actions
-- 2026-04-25 · Bulletproofing sprint L2.1 (build chunk 1 of 3)
--
-- Three actions trigger MFA on the worker side:
--   (a) DISPUTE_NEW   — initiating a worker dispute via /api/worker/disputes/new
--   (b) EXPORT_FULL   — full-history records export via /api/worker/records/export?format=all
--   (c) PHONE_CHANGE  — changing the worker's own phone number
--
-- Day-to-day operations (CLOCK_IN/OUT, BREAK, dispute REVIEW) are NOT
-- MFA-gated. The brake applies only when a worker exercises a right
-- or changes an identity-anchor field.
--
-- Mechanism: email is the second factor (SMS is the primary factor;
-- using SMS for both defeats defence-in-depth). Workers without an
-- email on file cannot exercise these actions in-app — they must
-- email support@flosmosis.com (acceptable per the human-mediated
-- path always available).

BEGIN;

-- ── worker_mfa_challenges ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_mfa_challenges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id     uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  -- Which high-value action this challenge unlocks. Constrained at
  -- DB layer so a future drift in route code can't widen the set
  -- silently.
  challenge_for text NOT NULL CHECK (challenge_for IN (
    'DISPUTE_NEW',
    'EXPORT_FULL',
    'PHONE_CHANGE'
  )),
  -- bcrypt(code, cost=10). Never stored plaintext. The 6-digit code
  -- itself is delivered via the worker's verified email.
  code_hash     text NOT NULL,
  issued_at     timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz,
  attempts      integer NOT NULL DEFAULT 0
                  CHECK (attempts >= 0 AND attempts <= 10),
  -- IP + UA at issue time. Captured for forensic audit if a
  -- challenge is later disputed; not used for binding (otherwise
  -- a worker on a flaky network could lock themselves out).
  ip_address    inet,
  user_agent    text,
  CONSTRAINT mfa_challenge_expires_after_issue
    CHECK (expires_at > issued_at)
);

-- One unconsumed challenge per (worker, challenge_for) at a time.
-- Re-issuing a code invalidates any prior unconsumed one for the
-- same action — handled at app layer (atomic update). The partial
-- index supports fast lookup of "is there a pending challenge".
CREATE INDEX IF NOT EXISTS idx_mfa_worker_unconsumed
  ON worker_mfa_challenges (worker_id, challenge_for)
  WHERE consumed_at IS NULL;

-- Audit lookup by worker, newest first.
CREATE INDEX IF NOT EXISTS idx_mfa_worker_recency
  ON worker_mfa_challenges (worker_id, issued_at DESC);

-- ── worker_mfa_grants ────────────────────────────────────────────────
-- After a successful verify, the worker holds a short-lived "MFA-
-- verified" grant for the action class. The high-value route checks
-- this grant before performing the action. 15-minute TTL so a
-- worker isn't kicked back to email after every form-validation
-- error, but doesn't hold the grant forever either.
CREATE TABLE IF NOT EXISTS worker_mfa_grants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id     uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  challenge_for text NOT NULL CHECK (challenge_for IN (
    'DISPUTE_NEW',
    'EXPORT_FULL',
    'PHONE_CHANGE'
  )),
  granted_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz,
  -- Pointer back to the challenge that granted this. Useful for
  -- forensics + for "show me the audit chain for this dispute".
  challenge_id  uuid NOT NULL REFERENCES worker_mfa_challenges(id),
  CONSTRAINT mfa_grant_expires_after_grant
    CHECK (expires_at > granted_at)
);

-- Lookup: "does this worker hold an unexpired grant for this action"?
CREATE INDEX IF NOT EXISTS idx_mfa_grant_active
  ON worker_mfa_grants (worker_id, challenge_for, expires_at DESC)
  WHERE consumed_at IS NULL;

-- ── RLS ─────────────────────────────────────────────────────────────
-- Workers can SELECT their own challenges + grants (for the in-app
-- "show me my recent verifications" diagnostic UI). Only the
-- service-role server can INSERT or UPDATE.
ALTER TABLE worker_mfa_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_mfa_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS worker_mfa_challenges_self_select ON worker_mfa_challenges;
CREATE POLICY worker_mfa_challenges_self_select
  ON worker_mfa_challenges
  FOR SELECT
  TO authenticated
  USING (
    worker_id IN (
      SELECT id FROM workers WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS worker_mfa_grants_self_select ON worker_mfa_grants;
CREATE POLICY worker_mfa_grants_self_select
  ON worker_mfa_grants
  FOR SELECT
  TO authenticated
  USING (
    worker_id IN (
      SELECT id FROM workers WHERE user_id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE require service role (no policies = no access
-- through PostgREST for non-service-role users; service role bypasses
-- RLS entirely).

COMMIT;

-- ── Verification queries (run after migration) ──────────────────────
-- 1. Tables exist:
--    SELECT table_name FROM information_schema.tables
--    WHERE table_name IN ('worker_mfa_challenges', 'worker_mfa_grants');
-- 2. RLS enabled:
--    SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('worker_mfa_challenges', 'worker_mfa_grants');
-- 3. Policies present:
--    SELECT polname, polrelid::regclass FROM pg_policy
--    WHERE polrelid::regclass::text IN
--    ('worker_mfa_challenges', 'worker_mfa_grants');
