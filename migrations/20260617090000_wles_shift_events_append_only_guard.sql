-- WLES append-only enforcement: a sealed shift_events row is IMMUTABLE.
--
-- INSERT is the only permitted mutation. A correction extends the chain with
-- a NEW row (see POST /api/command/shifts/:id/correct) and never touches the
-- sealed original. Until now that was guaranteed only by application
-- discipline: RLS REVOKEs UPDATE/DELETE from `authenticated`, but the service
-- role (which every write path uses) bypasses RLS, so a stray
-- `.update()`/`.delete()` in any route, repo, RPC, or ad-hoc script could
-- silently mutate a sealed event with zero database objection.
--
-- A row-level BEFORE trigger fires even for the service role and inside
-- SECURITY DEFINER functions — it cannot be bypassed by RLS or GRANTs. This
-- is the STRUCTURAL guarantee behind "the original event stays sealed".
--
-- Escape hatch: a deliberate `SET LOCAL wles.allow_mutation = 'on'` within a
-- transaction permits mutation for legitimate, audited maintenance (a future
-- migration that must rewrite the table, or gated test teardown). Normal
-- application writes never set it, so an accidental UPDATE/DELETE is rejected.
-- Disabling the trigger entirely (ALTER TABLE ... DISABLE TRIGGER) is itself
-- an auditable DDL event — exactly the friction we want.

CREATE OR REPLACE FUNCTION public.reject_shift_events_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $func$
BEGIN
  IF current_setting('wles.allow_mutation', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION
    'shift_events is append-only: % on sealed event % is forbidden (extend the chain with a corrective INSERT instead)',
    TG_OP, OLD.id
    USING ERRCODE = 'integrity_constraint_violation';
END;
$func$;

DROP TRIGGER IF EXISTS shift_events_block_update ON public.shift_events;
CREATE TRIGGER shift_events_block_update
  BEFORE UPDATE ON public.shift_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_shift_events_mutation();

DROP TRIGGER IF EXISTS shift_events_block_delete ON public.shift_events;
CREATE TRIGGER shift_events_block_delete
  BEFORE DELETE ON public.shift_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_shift_events_mutation();
