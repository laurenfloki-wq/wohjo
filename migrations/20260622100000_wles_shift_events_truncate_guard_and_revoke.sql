-- WLES append-only enforcement, part 2: TRUNCATE + grant hardening (audit A2).
--
-- The 2026-06-17 guard installed row-level BEFORE UPDATE/DELETE triggers, which
-- fire even for the service role. But Postgres does NOT fire row-level triggers
-- on TRUNCATE, and `service_role` (which every app write path uses, bypassing
-- RLS) still holds TRUNCATE/UPDATE/DELETE grants. So a single
-- `TRUNCATE shift_events` — or a stray service-role UPDATE/DELETE reaching the
-- table through a grant the trigger is meant to backstop — could erase the
-- sealed wage ledger. TRUNCATE in particular leaves no rows for the hash chain
-- to fail on, so the integrity alarm would stay GREEN over a total wipe.
--
-- Two independent defences, matching the row-level guard's philosophy:
--   1. A statement-level BEFORE TRUNCATE trigger that honours the same
--      `wles.allow_mutation` escape hatch (owner-run maintenance only).
--   2. REVOKE TRUNCATE/UPDATE/DELETE from service_role, so the app role
--      physically cannot mutate the ledger even if a trigger were disabled.
--      INSERT + SELECT are retained (the only operations the app performs).
--
-- Safe to apply: no production code path UPDATE/DELETE/TRUNCATEs shift_events,
-- and no app code sets the hatch. Owner-run maintenance migrations run as
-- `postgres`, which keeps all grants and can still use the hatch.

-- 1. Statement-level TRUNCATE guard (row-level triggers don't fire on TRUNCATE).
CREATE OR REPLACE FUNCTION public.reject_shift_events_truncate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $func$
BEGIN
  IF current_setting('wles.allow_mutation', true) = 'on' THEN
    RETURN NULL; -- statement-level trigger: return value is ignored
  END IF;
  RAISE EXCEPTION
    'shift_events is append-only: TRUNCATE is forbidden (the sealed wage ledger must never be bulk-erased; use a gated SET LOCAL wles.allow_mutation maintenance transaction if truly required)'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$func$;

DROP TRIGGER IF EXISTS shift_events_block_truncate ON public.shift_events;
CREATE TRIGGER shift_events_block_truncate
  BEFORE TRUNCATE ON public.shift_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_shift_events_truncate();

-- 2. Defence in depth: strip the mutation grants the app role never legitimately
--    uses. The append-only contract is INSERT-only; corrections extend the chain
--    with a new row. The owner (postgres) retains full grants for migrations.
REVOKE TRUNCATE, UPDATE, DELETE ON public.shift_events FROM service_role;
