-- FLOS-SHA-001 — Substrate Health Agent: persistence table
-- Backing table for /api/cron/substrate-health and /api/admin/substrate-health.
-- Operations-internal data. Service role only (RLS enabled, no policies).

CREATE TABLE IF NOT EXISTS public.substrate_health_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at       timestamptz NOT NULL DEFAULT now(),
  check_name   text NOT NULL CHECK (check_name IN (
    'chain_integrity_shift_events',
    'chain_integrity_auth_events',
    'advisor_sweep',
    'webhook_delivery_twilio',
    'webhook_delivery_stripe',
    'webhook_delivery_supabase_auth',
    'cron_health',
    'error_rate'
  )),
  status       text NOT NULL CHECK (status IN ('GREEN', 'YELLOW', 'RED', 'DEFERRED', 'ERROR')),
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  baseline     jsonb,
  duration_ms  integer
);

CREATE INDEX IF NOT EXISTS idx_substrate_health_log_run_at
  ON public.substrate_health_log (run_at DESC);

CREATE INDEX IF NOT EXISTS idx_substrate_health_log_status
  ON public.substrate_health_log (status)
  WHERE status <> 'GREEN';

ALTER TABLE public.substrate_health_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.substrate_health_log IS
  'FLOS-SHA-001 daily substrate health check results. Service-role only. See ~/FLOSMOSIS/ops/FLOS-SHA-001-Substrate-Health-Agent-spec.md.';

COMMENT ON COLUMN public.substrate_health_log.detail IS
  'Per-check structured detail (chain tip hash, advisor lint findings, webhook row counts, etc.). Schema is per-check.';

COMMENT ON COLUMN public.substrate_health_log.baseline IS
  'Snapshot of the comparison baseline at run time. NULL for checks where baseline is not applicable (e.g. chain_integrity).';