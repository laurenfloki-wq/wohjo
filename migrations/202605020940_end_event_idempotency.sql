-- Saturday Task 6: END_EVENT idempotency via client_event_id.
--
-- Substrate-DD context: Friday's E2E test surfaced that Joao tapped
-- End Shift 5 times during the schema-drift bug at deeed32. 5
-- duplicate END_EVENT rows landed in shift_events. The schema-drift
-- root cause was fixed at deeed32; this migration closes the
-- underlying idempotency gap.
--
-- Pattern: unique partial index on
-- (worker_id, (event_data->>'client_event_id')) WHERE
-- event_type = 'END_EVENT' AND event_data ? 'client_event_id'.
-- The WHERE clause makes this a partial index — only END_EVENT rows
-- that carry a client_event_id participate, which preserves
-- backward compatibility with any historical END_EVENT row that
-- pre-dates the client_event_id capture (none expected at this
-- stage, but the partial-index guard avoids backfill noise).
--
-- INSERT semantics from the application: try INSERT; on PG error
-- 23505 (unique_violation) the route handler treats the duplicate as
-- idempotent success and reads the existing row. The unique
-- constraint provides the atomic guarantee under concurrent INSERTs
-- (database-layer race-free).
--
-- Why not extend to START_EVENT too: existing START_EVENTs (Joao's
-- 1-May row) already carry client_event_id but no constraint enforces
-- uniqueness — the route's pre-existing logic prevents double-START
-- via state transitions on the shifts row (status: IN_PROGRESS guard).
-- A future migration can extend this constraint once the START route
-- has been audited; out-of-scope for this Saturday hotfix.
--
-- DO NOT auto-apply. Lauren applies via Supabase SQL Editor on
-- Sunday after substrate-DD review.
--
-- Joao E2E test sacred zone: Joao's existing 1-May START_EVENT row
-- is unaffected (the partial index covers END_EVENT only). The
-- WHERE filter on event_type = 'END_EVENT' AND event_data ?
-- 'client_event_id' means existing START rows are out of scope.
-- Joao's eventual END_EVENT (when he clocks off in Sunday's re-test)
-- will be the first row to participate in this index.

BEGIN;

-- The partial index. PostgreSQL evaluates the WHERE on insert/update
-- to decide whether the row is in scope. event_data ? 'client_event_id'
-- is the JSONB key-existence operator — true if the event_data JSON
-- has a client_event_id key.
CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_events_end_idempotent
  ON public.shift_events (worker_id, (event_data->>'client_event_id'))
  WHERE event_type = 'END_EVENT'
    AND event_data ? 'client_event_id';

COMMENT ON INDEX public.uq_shift_events_end_idempotent IS
  'END_EVENT idempotency on (worker_id, client_event_id). '
  'Application catches PG error 23505 to surface idempotent success. '
  'Pattern follows append_sms_code_if_absent (1bac633). '
  'Saturday Task 6, migration 202605020940.';

COMMIT;
