-- CRACK 214: REVOKE EXECUTE on set_worker_disputes_updated_at trigger function from PUBLIC
-- The trigger function (created in CRACK 195) was granted EXECUTE to PUBLIC by default.
-- Trigger functions can't be called directly (they're invoked by triggers with TRIGGER context),
-- so PUBLIC EXECUTE is documentary discipline only. Other trigger functions in public schema
-- (admins_set_updated_at, set_updated_at_now, validate_shift_event_chain, 
-- enforce_shift_status_transitions) do NOT have PUBLIC EXECUTE — sweep aligns this one.

REVOKE EXECUTE ON FUNCTION public.set_worker_disputes_updated_at() FROM PUBLIC;