-- Per-site "supervisor and director are the same person" flag.
--
-- When true:
--   1. the supervisor SMS is skipped on shift submit (you don't text yourself);
--   2. the director clears both approval gates in one action — the
--      command/approve route seals SUPERVISOR_APPROVAL then PAYROLL_APPROVAL
--      in a single call, landing the shift at PAYROLL_APPROVED.
--
-- Additive, non-breaking; defaults to false (the standard two-step flow,
-- so every existing site keeps the supervisor-SMS + separate-payroll path).

ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS supervisor_is_director boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sites.supervisor_is_director IS
  'When true, the on-site supervisor and the payroll director are the same person: skip the supervisor SMS and allow a single combined approval (both SUPERVISOR_APPROVAL and PAYROLL_APPROVAL sealed in one action).';
