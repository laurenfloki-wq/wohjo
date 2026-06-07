-- crack_207_unindexed_foreign_keys
-- Add covering indexes for 7 foreign key constraints flagged by Supabase advisor 0001.
-- Improves JOIN performance and FK validation speed at scale.

CREATE INDEX IF NOT EXISTS idx_shift_events_site_id 
  ON public.shift_events (site_id);

CREATE INDEX IF NOT EXISTS idx_shifts_site_id 
  ON public.shifts (site_id);

CREATE INDEX IF NOT EXISTS idx_shifts_supervisor_approved_by 
  ON public.shifts (supervisor_approved_by);

CREATE INDEX IF NOT EXISTS idx_sites_company_id 
  ON public.sites (company_id);

CREATE INDEX IF NOT EXISTS idx_supervisors_company_id 
  ON public.supervisors (company_id);

CREATE INDEX IF NOT EXISTS idx_worker_mfa_grants_challenge_id 
  ON public.worker_mfa_grants (challenge_id);

CREATE INDEX IF NOT EXISTS idx_workers_company_id 
  ON public.workers (company_id);