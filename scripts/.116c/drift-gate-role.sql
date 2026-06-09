-- ────────────────────────────────────────────────────────────────────
-- DRIFT GATE — least-privilege read-only role
-- ────────────────────────────────────────────────────────────────────
-- Audience: Lauren. Code does NOT execute this. Lauren runs it once
-- against production, then provisions the PGURL_PROD_READONLY secret.
--
-- Project: rwnxnnudljpgyfwbnosu (ap-southeast-2)
-- Database: postgres
-- Run as:  postgres (Supabase SQL editor's default role)
--
-- Generate a strong random password before running, e.g.:
--   openssl rand -base64 32
-- and substitute it for :'pw' below (or use psql `\set pw '...'` and
-- run via psql -c '\set pw ...; \i drift-gate-role.sql').
--
-- ────────────────────────────────────────────────────────────────────
-- Privilege model — why no GRANT SELECT on any table or view
-- ────────────────────────────────────────────────────────────────────
-- The drift gate (scripts/.116c/drift-gate.mjs) reads system catalogs
-- only to recompute the ten substrate fingerprints:
--
--   pg_class, pg_namespace, pg_attribute, pg_attrdef, pg_index,
--   pg_proc, pg_trigger, pg_policy, pg_extension, pg_type, pg_roles
--
-- and the pg_get_*def functions (pg_get_indexdef, pg_get_functiondef,
-- pg_get_triggerdef, pg_get_expr, pg_get_viewdef). It NEVER reads
-- application row data. pg_catalog is universally readable; pg_get_*def
-- functions resolve definitions from catalog OIDs without needing
-- privileges on the target object.
--
-- So the role needs CONNECT + USAGE only — and crucially, NO SELECT
-- grants on any application table or view. This makes the negative
-- PII test pass by construction: there is no GRANT to revoke, no
-- privilege to audit, no path to user data.
--
-- default_transaction_read_only = on adds a belt-and-braces guarantee:
-- even if the connection string were misused, every statement is
-- forced into read-only mode at session start.
--
-- The role does NOT inherit from authenticated, service_role, or
-- postgres — these would back-door it into row-level privileges that
-- bypass the audit.

create role drift_gate_ro with login password :'pw'
  nosuperuser nocreatedb nocreaterole noinherit;

grant connect on database postgres to drift_gate_ro;
grant usage on schema public to drift_gate_ro;
alter role drift_gate_ro set default_transaction_read_only = on;

-- Deliberately NO 'grant select' on any table or view.
-- Do NOT grant authenticated / service_role / postgres membership.

-- ────────────────────────────────────────────────────────────────────
-- Self-verification (run after the GRANTs above)
-- ────────────────────────────────────────────────────────────────────
-- Both queries must return zero rows. If either returns >0, the role
-- has a SELECT grant somewhere it should not.

-- (a) zero direct or default-privilege table grants
select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'drift_gate_ro';
-- Expected: 0 rows.

-- (b) zero role memberships beyond the implicit public group
select rolname as inherited_from
from pg_auth_members m
join pg_roles r on r.oid = m.roleid
where m.member = (select oid from pg_roles where rolname = 'drift_gate_ro');
-- Expected: 0 rows.

-- ────────────────────────────────────────────────────────────────────
-- After running this script:
-- ────────────────────────────────────────────────────────────────────
-- 1. Note the password (it is never echoed by Postgres — capture before
--    you paste).
-- 2. Construct the connection string:
--      postgres://drift_gate_ro:<password>@db.rwnxnnudljpgyfwbnosu.supabase.co:5432/postgres?sslmode=require
-- 3. Set the GitHub Actions repository secret PGURL_PROD_READONLY to
--    that connection string. Workflow consuming it is at
--    .github/workflows/drift-gate.yml.
-- 4. Have chat-Claude audit the role's effective privileges before the
--    gate is switched live (see DRIFT-GATE-README.md "Audit handoff").
-- 5. After the first clean hourly run (or workflow_dispatch), Code can
--    promote 'Compare live prod vs committed rebuild references' to
--    a required status check on main (Stage 3 branch protection) —
--    after Lauren's explicit go-ahead.
