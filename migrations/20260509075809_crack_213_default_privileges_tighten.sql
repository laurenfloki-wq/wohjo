-- CRACK 213: Tighten ALTER DEFAULT PRIVILEGES so future objects in public schema don't
-- inherit broad write grants under this migration role's context.
--
-- Note on scope: this affects default privileges for objects created BY the migration
-- role going forward. The supabase_admin grantor's defaults remain untouched (insufficient
-- privilege to modify those). Practically: future Supabase MCP migrations will not auto-grant
-- broad privileges. Future direct supabase_admin actions still inherit existing pattern.
-- This is the cleaner half of the fix; CRACK 212 handles the existing tables side.

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON TABLES FROM authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, SELECT ON TABLES FROM anon;