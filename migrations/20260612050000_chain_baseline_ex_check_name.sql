-- Spine ruling 2026-06-12 (SG-4 chain-integrity disposition):
-- verify-hashes additionally records chain_integrity_shift_events_ex_baseline --
-- the raw check stays RED and honest; the ex-baseline check is the
-- operational signal once the known-exceptions baseline is adopted.
-- This extends the check_name CHECK constraint with the new value only.
ALTER TABLE substrate_health_log DROP CONSTRAINT substrate_health_log_check_name_check;
ALTER TABLE substrate_health_log ADD CONSTRAINT substrate_health_log_check_name_check
  CHECK (check_name = ANY (ARRAY[
    'chain_integrity_shift_events'::text,
    'chain_integrity_shift_events_ex_baseline'::text,
    'chain_integrity_auth_events'::text,
    'advisor_sweep'::text,
    'webhook_delivery_twilio'::text,
    'webhook_delivery_stripe'::text,
    'webhook_delivery_supabase_auth'::text,
    'cron_health'::text,
    'error_rate'::text,
    'anchor_fingerprint'::text
  ]));

-- Rollback: re-create the constraint without
-- 'chain_integrity_shift_events_ex_baseline'.
