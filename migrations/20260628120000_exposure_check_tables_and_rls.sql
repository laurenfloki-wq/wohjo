-- Labour Hire Exposure Check (lead tool) — submissions + leads tables and RLS.
--
-- These are PROSPECT tables, not multi-tenant company data: a firm filling in
-- the check is not (yet) a tenant, so the current_user_company_id() scoping
-- used elsewhere does not apply. Posture follows the service-only pattern
-- (cf. worker_record_exports): anon has NO access; all writes go through the
-- validated, rate-limited server route using the service role; founder/admin
-- reads happen via service role (or a future authenticated founder policy).
--
-- exposure_submissions holds NO PII (anonymised answer choice values + scores).
-- exposure_leads holds the contact PII and FKs to the submission.
--
-- Companion code: src/db/schema.ts (Drizzle mirror),
-- src/lib/db/repositories/exposure.repo.ts, src/app/api/exposure/lead/route.ts.

-- ── exposure_submissions ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.exposure_submissions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  ruleset_version  text NOT NULL,
  answers          jsonb NOT NULL DEFAULT '{}'::jsonb,
  scores           jsonb NOT NULL DEFAULT '{}'::jsonb,
  states           jsonb NOT NULL DEFAULT '[]'::jsonb,
  worker_band      text,
  overall          text NOT NULL CHECK (overall IN ('clear','watch','exposed','na')),
  biggest_gap      text,
  source           text,
  utm              jsonb,
  session_id       text
);

CREATE INDEX IF NOT EXISTS idx_exposure_submissions_created_at
  ON public.exposure_submissions (created_at DESC);

ALTER TABLE public.exposure_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exposure_submissions_service_all ON public.exposure_submissions;
CREATE POLICY exposure_submissions_service_all
  ON public.exposure_submissions
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ── exposure_leads ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.exposure_leads (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id        uuid NOT NULL REFERENCES public.exposure_submissions(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  work_email           text NOT NULL,
  company              text NOT NULL,
  role                 text,
  phone                text,
  consent              boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  hubspot_sync_status  text NOT NULL DEFAULT 'pending'
                         CHECK (hubspot_sync_status IN ('pending','synced','failed','skipped'))
);

CREATE INDEX IF NOT EXISTS idx_exposure_leads_submission
  ON public.exposure_leads (submission_id);

CREATE INDEX IF NOT EXISTS idx_exposure_leads_created_at
  ON public.exposure_leads (created_at DESC);

ALTER TABLE public.exposure_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exposure_leads_service_all ON public.exposure_leads;
CREATE POLICY exposure_leads_service_all
  ON public.exposure_leads
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');
