-- OBS-3 dead-man's-switch — admit the 'cron_health_substrate' check past the
-- substrate_health_log.check_name CHECK constraint. verify-hashes writes this
-- check to confirm substrate-health itself ran recently (the two crons watch
-- each other). Without this the health insert is silently rejected — the same
-- trap that hid 'notification_outbound' on 2026-06-12.
ALTER TABLE public.substrate_health_log
  DROP CONSTRAINT IF EXISTS substrate_health_log_check_name_check;
ALTER TABLE public.substrate_health_log
  ADD CONSTRAINT substrate_health_log_check_name_check
  CHECK (check_name = ANY (ARRAY[
    'chain_integrity_shift_events',
    'chain_integrity_shift_events_ex_baseline',
    'chain_integrity_auth_events',
    'advisor_sweep',
    'webhook_delivery_twilio',
    'webhook_delivery_stripe',
    'webhook_delivery_supabase_auth',
    'cron_health',
    'error_rate',
    'anchor_fingerprint',
    'notification_outbound',
    'chain_count_anchor',
    'shift_commit_completeness',
    'cron_health_substrate'
  ]));
