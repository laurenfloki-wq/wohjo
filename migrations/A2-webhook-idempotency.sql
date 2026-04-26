-- A2 Webhook idempotency — hardening Day 2 migration
--
-- Records every delivered webhook so replays from external services
-- (Twilio retry-on-timeout, Stripe event replay, Supabase auth retry)
-- are detected and short-circuited at the application layer.
--
-- Source-specific key conventions are enforced by the caller, not the
-- database; the UNIQUE index is on (source, key) so the same key
-- value can legitimately appear across different sources.

CREATE TABLE IF NOT EXISTS webhook_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('twilio','stripe','supabase-auth','generic')),
  key text NOT NULL,
  route text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now()
);

-- Uniqueness per (source, key). Attempting to insert a duplicate raises
-- SQLSTATE 23505, which the idempotency helper uses to detect replays.
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_idempotency_source_key
  ON webhook_idempotency(source, key);

-- Useful for debugging ("what have we seen today?").
CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_first_seen
  ON webhook_idempotency(first_seen_at DESC);

-- RLS: only service_role can read/write. No human admin should need
-- direct access; operational queries go via the Supabase SQL editor
-- running as the postgres role (which bypasses RLS).
ALTER TABLE webhook_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_idempotency_service_all ON webhook_idempotency;
CREATE POLICY webhook_idempotency_service_all
  ON webhook_idempotency
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
