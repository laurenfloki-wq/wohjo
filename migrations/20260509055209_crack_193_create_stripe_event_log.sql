-- CRACK 193: create stripe_event_log + RLS
-- Extracted verbatim from migrations/202604250930_onboarding_company_fields.sql lines 71-82.
-- That block was never applied as a standalone migration; production has 0 rows in
-- information_schema.tables WHERE table_name='stripe_event_log'.
-- Mo-pilot blocker before Stripe live mode flip.
-- RLS pattern: (select auth.role()) per CRACK 206 substrate-DD discipline.

CREATE TABLE IF NOT EXISTS stripe_event_log (
  event_id   text PRIMARY KEY,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  payload_summary jsonb
);

ALTER TABLE stripe_event_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stripe_event_log_service_only ON stripe_event_log;
CREATE POLICY stripe_event_log_service_only
  ON stripe_event_log
  FOR ALL
  USING ((select auth.role()) = 'service_role'::text)
  WITH CHECK ((select auth.role()) = 'service_role'::text);