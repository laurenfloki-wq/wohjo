-- Supervisors table missing created_at column that workers/sites/companies have.
--
-- Root cause for the "0 registered" rendering bug at /command/supervisors:
-- src/app/api/command/supervisors/route.ts SELECTs and ORDERs by created_at,
-- which does not exist in the supervisors table. The Supabase client returns
-- a Postgres "column does not exist" error, the route returns 500, and the
-- page silently renders the empty state. See
-- ~/Desktop/FLOSTRUCTION-Build/supervisors-rendering-bug-audit-2026-04-30.md
-- for the full investigation, and the Friday morning SQL queries Lauren ran
-- to confirm the schema diff.
--
-- DO NOT auto-apply. Lauren applies via `supabase db push` after staging-clone
-- validation OR via Supabase SQL Editor manually. The Stage 1 commit ships
-- the route fix that omits created_at, so the page works without this
-- migration. Stage 2 commit (route reverted to canonical created_at SELECT
-- + ORDER desc) ships only after this migration is applied to production.
--
-- Joao E2E test sacred zone: untouched. The supervisors row Lauren observed
-- ("0 registered") is the FLOSMOSIS Test tenant supervisor used for SMS
-- approval — but supervisor batch dispatch (/api/cron/supervisor-batch)
-- does not query created_at, so this migration has zero impact on the
-- in-flight Joao test.

ALTER TABLE public.supervisors
  ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();

UPDATE public.supervisors
  SET created_at = now()
  WHERE created_at IS NULL;

ALTER TABLE public.supervisors
  ALTER COLUMN created_at SET NOT NULL;

-- Optional: a matching index for ORDER BY created_at queries. Skipped here
-- because the supervisors table is small (1 row per supervisor per tenant,
-- typical-customer scale ~5 rows per tenant), so a sequential scan is fine
-- and the index would cost more than it saves. Add later if a tenant
-- materially exceeds typical scale.
