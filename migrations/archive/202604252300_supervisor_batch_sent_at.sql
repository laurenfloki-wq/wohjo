-- L2.1 chunk 3 — supervisors.last_batch_sms_sent_at (timestamptz)
-- 2026-04-25
--
-- The existing supervisors.last_batch_sms_date column tracks the
-- DATE of the most recent SMS-batch send. RULE_011
-- (RUBBER_STAMP_RISK) needs to detect approvals received within
-- ≤5 seconds of the batch send — date precision is too coarse.
-- Add a second-precision timestamptz column populated by
-- supervisor-batch at send time and read by the inbound sms-reply
-- route at YES ALL receipt time.

BEGIN;

ALTER TABLE supervisors
  ADD COLUMN IF NOT EXISTS last_batch_sms_sent_at timestamptz;

-- Backfill: leave NULL for existing rows. The rule's evaluator
-- treats NULL as "no batch tracked" and skips the latency check
-- (cannot fire). This preserves the no-block / no-block-when-
-- unknown stance of the rules engine.

COMMENT ON COLUMN supervisors.last_batch_sms_sent_at IS
  'Second-precision timestamp of the most recent supervisor SMS batch send. Used by INTELLIGENCE rule RULE_011 (RUBBER_STAMP_RISK) to compute reply latency. Updated by /api/cron/supervisor-batch at send time; read by /api/webhooks/twilio/sms-reply at YES ALL receipt time.';

COMMIT;
