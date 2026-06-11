-- W4 / SG-5 — webhook delivery dead-letter upgrade (2026-06-11)
--
-- Brings Twilio inbound to the Stripe webhook's insert-first bar.
-- Before: webhook_idempotency recorded (source, key) BEFORE processing
-- with no processed marker — a mid-flight failure returned 5xx, the
-- provider retried, and the replay short-circuited as "already seen":
-- the field action was silently lost.
--
-- After: the row carries the full delivery payload (replayable), a
-- processed_at set ONLY on successful processing, and an outcome
-- label. Replays of unprocessed rows REPROCESS; unprocessed rows older
-- than the provider retry window are dead letters surfaced RED by the
-- FLOS-SHA-001 webhook_delivery_twilio check.
--
-- Applied to production 2026-06-11 via Supabase MCP apply_migration
-- (w4_webhook_idempotency_dead_letter).

ALTER TABLE public.webhook_idempotency
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS outcome text;

COMMENT ON COLUMN public.webhook_idempotency.payload IS
  'Raw delivery payload (e.g. Twilio form params) captured at first sight so a dead-lettered action is replayable. NULL for pre-W4 rows and callers that do not pass one.';
COMMENT ON COLUMN public.webhook_idempotency.processed_at IS
  'Set ONLY when processing completed successfully (Stripe-bar semantics). NULL = unprocessed; a replay of an unprocessed key reprocesses instead of short-circuiting.';
COMMENT ON COLUMN public.webhook_idempotency.outcome IS
  'Terminal outcome label recorded at processed_at time (e.g. the parsed SMS action).';

-- Dead-letter scan: unprocessed deliveries by age.
CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_unprocessed
  ON public.webhook_idempotency (first_seen_at)
  WHERE processed_at IS NULL;

-- Backfill: every pre-W4 row was handled under return-empty-TwiML
-- semantics; mark them processed with a backfill label so the
-- dead-letter check starts from a clean slate (no-op on rebuild).
UPDATE public.webhook_idempotency
  SET processed_at = first_seen_at, outcome = 'backfill_pre_w4'
  WHERE processed_at IS NULL;
