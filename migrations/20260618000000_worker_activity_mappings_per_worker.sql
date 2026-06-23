-- Per-worker payroll activity mappings (MYOB activity IDs keyed by the
-- FLOSTRUCTION canonical category). Fully per-worker, no company default
-- (founder decision 2026-06-18). A nullable jsonb of { category: activity_id }
-- — operational config, the same data class as a worker's award; never sealed
-- evidence. Plain nullable column: no new table, no RLS/index/policy/default
-- change, so the schema drift gates stay green with no reference churn.
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS activity_mappings jsonb;
