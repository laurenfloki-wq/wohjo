-- B4b (2026-06-13 AEST): substrate_health_log.check_name has an
-- enumerating CHECK constraint that PR #113 did not extend when it
-- introduced the 'notification_outbound' check. Consequence on the
-- 2026-06-12 17:15 UTC run: the health-row insert violated the CHECK,
-- the route threw, and cron_health was silenced for the day (anchor /
-- twilio / stripe rows landed; notification_outbound and cron_health
-- did not).
--
-- Applied to production 2026-06-12 ~22:55 UTC via Supabase MCP
-- apply_migration (b4b_health_check_name_notification_outbound) and
-- verified with a rolled-back probe insert. Companion route change
-- makes the notification health-row insert non-fatal so a single
-- broken check can never take the alarm pipeline down again.

ALTER TABLE public.substrate_health_log
  DROP CONSTRAINT substrate_health_log_check_name_check;
ALTER TABLE public.substrate_health_log
  ADD CONSTRAINT substrate_health_log_check_name_check CHECK ((check_name = ANY (ARRAY[
    'chain_integrity_shift_events'::text,
    'chain_integrity_shift_events_ex_baseline'::text,
    'chain_integrity_auth_events'::text,
    'advisor_sweep'::text,
    'webhook_delivery_twilio'::text,
    'webhook_delivery_stripe'::text,
    'webhook_delivery_supabase_auth'::text,
    'cron_health'::text,
    'error_rate'::text,
    'anchor_fingerprint'::text,
    'notification_outbound'::text
  ])));
