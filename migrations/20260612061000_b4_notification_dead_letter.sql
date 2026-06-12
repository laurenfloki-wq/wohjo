-- B4 / SG-5 — outbound notification dead letters (2026-06-12)
--
-- Inbound deliveries (Twilio webhook, Stripe webhook) carry Stripe-bar
-- dead-letter semantics since W4/W5. Outbound was the gap: worker SMS
-- (approval/dispute) and Resend emails were fire-and-forget — a
-- provider outage silently dropped the human-facing observable with no
-- durable record. Worse, the Resend SDK reports API failures via a
-- returned { error } rather than throwing, so those failures were
-- invisible even to callers that DID try/catch.
--
-- This table is the durable record. Insert-only from the app (audit
-- trail immutable; replayed_at/replay_outcome are the only status
-- updates, operator-led). Bodies are NOT stored — they are regenerable
-- from substrate state, and MFA codes must never be persisted. The
-- summary carries kind + subject; context carries the triggering ids.
--
-- Surfaced by the FLOS-SHA-001 substrate-health check
-- 'notification_outbound' (RED while any unreplayed row exists).
-- Automated retry/backoff cron: parking lot (Dispatch 2 B4 note) —
-- operator replay is the demo-canon mechanism.

CREATE TABLE IF NOT EXISTS public.notification_dead_letter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('twilio_sms', 'resend_email')),
  recipient text NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text NOT NULL,
  context jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  replayed_at timestamptz,
  replay_outcome text
);

COMMENT ON TABLE public.notification_dead_letter IS
  'Failed outbound notifications (SMS/email). Insert-only; replayed_at/replay_outcome are the only permitted updates. No message bodies or codes - regenerate from context on replay.';
COMMENT ON COLUMN public.notification_dead_letter.summary IS
  'What was being sent: { kind, subject? }. Never message bodies, never OTP codes.';
COMMENT ON COLUMN public.notification_dead_letter.context IS
  'Triggering identifiers (shift_id, receipt_id, company_id, ...) sufficient for an operator to re-trigger the send.';

-- RLS: enabled with NO policies - only the service role (which
-- bypasses RLS) may touch this table. Belt-and-braces grant revoke.
ALTER TABLE public.notification_dead_letter ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_dead_letter FROM PUBLIC, anon, authenticated;

-- Health-check scan path: unreplayed dead letters.
CREATE INDEX IF NOT EXISTS idx_notification_dead_letter_unreplayed
  ON public.notification_dead_letter (created_at)
  WHERE replayed_at IS NULL;
