import { NextResponse } from 'next/server';

// ────────────────────────────────────────────────────────────────────
// DISABLED 2026-04-29 per substrate-DD audit (cron-substrate-audit-
// 2026-04-29.md + cron-remediation-plan-2026-04-29.md, Workstream C
// Path C decision approved by founder).
//
// The original implementation was written against a planned schema
// (referenced as Task9_EmailFallback_Gate.txt) that was never applied
// to production. Schema drift identified by the audit:
//
//   shifts.fallback_email_sent (boolean)        — missing in production
//   shifts.fallback_email_sent_at (timestamptz) — missing in production
//   shifts.start_time_source                    — missing in production
//   shifts.worker_confirmed_start_at            — missing in production
//   shifts.geofence_detected_at                 — missing in production
//   shift_approval_tokens table                 — missing in production
//   shifts.status enum value 'PENDING_APPROVAL' — production uses
//                                                 'SUBMITTED'
//   from-address noreply@flosmosis.com.au       — wrong domain;
//                                                 canonical is
//                                                 noreply@flosmosis.com
//
// The cron entry has been removed from vercel.json. This route returns
// 410 Gone for any direct invocation so the disablement is observable
// (rather than silently 404-ing or 500-erroring).
//
// Revival conditions (any future re-enablement must satisfy ALL of):
//   1. Decide whether 'PENDING_APPROVAL' should be added as a planned
//      future shifts.status enum value or whether the fallback path
//      should fire on existing 'SUBMITTED' state. Document the decision.
//   2. Write + apply migration adding the 5 missing shifts columns and
//      the shift_approval_tokens table (with RLS policies committed in
//      the same migration per CLAUDE.md non-negotiable #2).
//   3. Decide supervisor_id model: keep current naming OR align to
//      production's supervisor_approved_by column.
//   4. Update from-address to canonical
//      'FLOSTRUCTION <noreply@flosmosis.com>' via
//      process.env.CONTACT_EMAIL_FROM.
//   5. Add unit + integration tests covering happy path +
//      missing-supervisor + missing-email + token expiry.
//   6. Re-add to vercel.json with appropriate cadence.
//   7. Run the substrate-DD checklist (docs/substrate-dd-checklist.md)
//      end-to-end before merge.
// ────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(
    {
      error: 'gone',
      message:
        'approval-fallback disabled per substrate-DD audit 2026-04-29; see route source for revival conditions',
    },
    { status: 410 },
  );
}
