-- CRACK 232 schema prep for bulk worker upload.
-- APPLIED 2026-05-11 PM via Supabase MCP. This file is the
-- code-side record matching what's live in production.
--
-- Three changes, each minimally invasive:
--
-- 1. Admit WORKER_CREATED to the shift_events event_type CHECK constraint.
--    Pattern matches CRACK 218 (PAYROLL_APPROVAL admittance) and CRACK 195
--    (WORKER_DISPUTE_FILED admittance). The bulk-create RPC emits one
--    WORKER_CREATED event per inserted worker to satisfy WLES
--    Non-Negotiable #3 (every state change has a sealed event).
--
-- 2. Drop NOT NULL on workers.pay_rate. The bulk-upload CSV per the
--    2026-05-11 PM dispatch contains only employee_id / full_name /
--    mobile_e164 / myob_card_id — pay rates are bookkeeper-side
--    (out of Mo's scope in FLOSTRUCTION). The existing
--    workers_pay_rate_nonneg CHECK constraint already accepts NULL,
--    so this aligns the column nullability with the existing CHECK.
--
-- 3. Add tenant-scoped unique constraints on (company_id, employee_id)
--    and (company_id, phone). Pre-flight check confirmed zero existing
--    duplicates. The bulk-create RPC's atomic transaction relies on
--    these to make concurrent uploads race-safe at the DB layer.

-- ── (1) WORKER_CREATED in event_type CHECK ───────────────────────────
ALTER TABLE public.shift_events
  DROP CONSTRAINT IF EXISTS shift_events_event_type_check;

ALTER TABLE public.shift_events
  ADD CONSTRAINT shift_events_event_type_check
  CHECK (event_type IN (
    'START_EVENT',
    'END_EVENT',
    'SHIFT_COMMIT',
    'SUPERVISOR_APPROVAL',
    'PAYROLL_APPROVAL',
    'INTELLIGENCE_CLEAR',
    'ANOMALY_FLAG',
    'DISPUTE_RAISED',
    'EXPORT_RECORD',
    'CORRECTION',
    'BUG_CORRECTION',
    'SUPERVISOR_RE_APPROVAL',
    'X-FLOSMOSIS-SPEC_VERSION_MIGRATION',
    'WORKER_DISPUTE_FILED',
    'WORKER_CREATED'
  ));

-- ── (2) workers.pay_rate now nullable ────────────────────────────────
ALTER TABLE public.workers
  ALTER COLUMN pay_rate DROP NOT NULL;

-- ── (3) tenant-scoped unique constraints ─────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS workers_company_employee_id_unique
  ON public.workers (company_id, employee_id);

CREATE UNIQUE INDEX IF NOT EXISTS workers_company_phone_unique
  ON public.workers (company_id, phone);

COMMENT ON INDEX public.workers_company_employee_id_unique IS
  'CRACK 232 — tenant-scoped uniqueness for bulk worker upload.';

COMMENT ON INDEX public.workers_company_phone_unique IS
  'CRACK 232 — tenant-scoped uniqueness for bulk worker upload.';
