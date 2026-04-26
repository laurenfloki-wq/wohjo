-- Bulletproofing sprint P7-E1: race-free singleton event types.
-- 2026-04-25.
--
-- Adds UNIQUE constraints so the database itself rejects duplicate
-- shift events for types that should be singleton-per-(shift, worker).
--
-- Prior to this migration the application layer alone enforced
-- singleton semantics via `checkDuplicateStartEvent` and the offline-
-- queue idempotency. That works for sequential POSTs from a single
-- client. Under a true race (two devices, two supervisors, network
-- retry collision), the application check has a TOCTOU window.
--
-- The constraints below close the window: even if two transactions
-- race to insert simultaneously, exactly ONE wins; the loser gets a
-- unique-violation that the application surfaces as a friendly
-- "shift already started" / "shift already approved" error.
--
-- Singleton event types (one per shift_id + worker_id):
--   CLOCK_IN, CLOCK_OUT, SHIFT_COMMIT, APPROVAL,
--   START_EVENT, END_EVENT, SUPERVISOR_APPROVAL  (legacy v0)
--
-- Non-singleton (allowed multiple times per shift):
--   BREAK_START, BREAK_END, INTELLIGENCE_CLEAR, ANOMALY_FLAG,
--   DISPUTE_RAISED, EXPORT_RECORD, X-FLOSMOSIS-* extension types

BEGIN;

-- We can't create a partial UNIQUE index using a simple WHERE clause
-- against an enum-or-text column without expressing the singleton type
-- list. We use one partial index per singleton type to keep the
-- constraint expressions parseable + index size minimal.
--
-- Each index is on (shift_id, event_type) where shift_id can be derived
-- from event_data->>'shift_id'. We also add worker_id when present so
-- multi-worker shifts (rare today) aren't impacted.

-- Helper: resolve shift_id from event_data jsonb
-- Used in WHERE clauses below; immutable function avoids re-eval.
CREATE OR REPLACE FUNCTION shift_id_from_event_data(d jsonb)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(d->>'shift_id', '')::uuid
$$;

-- ── Singleton constraints ────────────────────────────────────────────

-- CLOCK_IN — one per (shift_id, worker_id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_events_clock_in
  ON public.shift_events (
    shift_id_from_event_data(event_data),
    worker_id
  )
  WHERE event_type = 'CLOCK_IN'
    AND shift_id_from_event_data(event_data) IS NOT NULL
    AND worker_id IS NOT NULL;

-- CLOCK_OUT — one per (shift_id, worker_id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_events_clock_out
  ON public.shift_events (
    shift_id_from_event_data(event_data),
    worker_id
  )
  WHERE event_type = 'CLOCK_OUT'
    AND shift_id_from_event_data(event_data) IS NOT NULL
    AND worker_id IS NOT NULL;

-- SHIFT_COMMIT — one per shift_id (regardless of worker)
CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_events_shift_commit
  ON public.shift_events (
    shift_id_from_event_data(event_data)
  )
  WHERE event_type = 'SHIFT_COMMIT'
    AND shift_id_from_event_data(event_data) IS NOT NULL;

-- APPROVAL — one per shift_id (one supervisor approval per shift)
CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_events_approval
  ON public.shift_events (
    shift_id_from_event_data(event_data)
  )
  WHERE event_type = 'APPROVAL'
    AND shift_id_from_event_data(event_data) IS NOT NULL;

-- ── v0 legacy equivalents (in case any v0-mode customers remain
--    post-activation; harmless if zero v0 rows match) ────────────────

CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_events_start_event_v0
  ON public.shift_events (
    shift_id_from_event_data(event_data),
    worker_id
  )
  WHERE event_type = 'START_EVENT'
    AND shift_id_from_event_data(event_data) IS NOT NULL
    AND worker_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_events_end_event_v0
  ON public.shift_events (
    shift_id_from_event_data(event_data),
    worker_id
  )
  WHERE event_type = 'END_EVENT'
    AND shift_id_from_event_data(event_data) IS NOT NULL
    AND worker_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_events_supervisor_approval_v0
  ON public.shift_events (
    shift_id_from_event_data(event_data)
  )
  WHERE event_type = 'SUPERVISOR_APPROVAL'
    AND shift_id_from_event_data(event_data) IS NOT NULL;

-- ── Client-side idempotency key for crash-recovery (P7-C1) ──────────
-- Worker apps generate a UUID `client_event_id` BEFORE POSTing a
-- clock-in. The server stores it in event_data->>'client_event_id'
-- and the unique index below dedupes any retry.
--
-- This protects against the "app crashed mid-POST, client retries on
-- restart, server already wrote the event" pattern.

CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_events_client_event_id
  ON public.shift_events ((event_data->>'client_event_id'))
  WHERE event_data->>'client_event_id' IS NOT NULL;

COMMIT;
