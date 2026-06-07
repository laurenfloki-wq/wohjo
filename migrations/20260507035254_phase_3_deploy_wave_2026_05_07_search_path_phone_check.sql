-- LOCK 1 — search_path on Phase 2 trigger functions (CRACK 99, 119, 126)
ALTER FUNCTION admins_set_updated_at() 
  SET search_path = pg_catalog, public;
ALTER FUNCTION enforce_shift_status_transitions() 
  SET search_path = pg_catalog, public;
ALTER FUNCTION set_updated_at_now() 
  SET search_path = pg_catalog, public;
ALTER FUNCTION validate_shift_event_chain() 
  SET search_path = pg_catalog, public;

-- LOCK 2 — Phone format CHECK on workers + supervisors (CRACK 114)
ALTER TABLE workers ADD CONSTRAINT workers_phone_e164_format
  CHECK (phone ~ '^\+\d{8,15}$');
ALTER TABLE supervisors ADD CONSTRAINT supervisors_phone_e164_format
  CHECK (phone ~ '^\+\d{8,15}$');