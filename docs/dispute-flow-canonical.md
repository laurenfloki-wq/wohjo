# Canonical worker-notification + dispute flow

**Owner:** Lauren Kate de Mestre
**Last updated:** 2026-04-30
**Source-of-truth code paths:** linked inline below.
**Read alongside:** `~/Desktop/FLOSTRUCTION-Workflow-Analysis/labour-hire-workflow-gap-analysis-2026-04-29.md` §2.6 + §2.7 (the recon that surfaced these gaps).

This document is the canonical reference for what happens *after* a worker submits a shift, across both supervisor approval and supervisor dispute paths. Worker FAQ, supervisor onboarding, and Mo conversation framing all reference this.

## Approval flow

### Trigger
Supervisor approves a shift via one of three entry points:

1. **SMS YES reply** — supervisor receives the batch (or inline) SMS, replies `YES ALL` or `YES <code>`. Handled by `src/app/api/webhooks/twilio/sms-reply/route.ts`.
2. **Web `/verify` page** — supervisor opens the verify URL and clicks Approve on the shift. Handled by `src/app/api/verify/approve/[shiftId]/route.ts`.
3. **Admin `/command` dashboard** — admin user advances a SUPERVISOR_APPROVED shift to PAYROLL_APPROVED. Handled by `src/app/api/command/shifts/[shiftId]/approve/route.ts`. (This is the second-stage payroll approval, not the supervisor approval.)

### What happens (steps 1–6)

1. **WLES SUPERVISOR_APPROVAL event written** to `shift_events` with method tag (`WOHJO_SMS` for SMS path, `WOHJO_VERIFY` for web path). Includes approver phone derived server-side from the supervisor row (never from request body — token is the trust anchor).
2. **Shift status transition** `SUBMITTED → SUPERVISOR_APPROVED` with compound predicate guard (`.eq('status', 'SUBMITTED')`) to prevent race conditions. `supervisor_approved_by` and `supervisor_approved_at` populated.
3. **Supervisor pending list cleaned** — the shift's 6-character code is removed from `supervisors.pending_sms_approval_ids`.
4. **Payroll admin notified via email** — `notifyPayrollAdmin` sends a Resend email to `companies.contact_email` summarising the approval. Failure is logged but does not block.
5. **Worker notified via SMS** — `sendWorkerApprovedSms` (`src/lib/sms/worker-notify.ts`) sends an SMS to the worker's phone with their hours, approval timestamp, and a link to the public receipt at `https://flosmosis.com/receipt/<receiptId>`. Fire-and-forget; failure is logged but does not roll back the WLES event. **All three approval entry points invoke this same helper as of 2026-04-30**; pre-fix only the SMS-reply path notified workers (gap closed in Workstream 2 today per labour-hire-workflow-gap-analysis-2026-04-29 §2.6).
6. **Worker app receipt page** updates to show approved status on next refresh. Worker-facing copy is the SMS body (immediate) plus the receipt page (canonical record).

### Worker-side observable
Within seconds: an SMS lands containing the receipt ID, hours, "Approved: HH:MM AEST", and a public-receipt URL. The receipt page (`src/app/(field)/field/receipt/[receiptId]/page.tsx`) shows the SUPERVISOR_APPROVED status.

## Dispute flow

### Trigger
Supervisor disputes via one of two entry points:

1. **SMS NO reply** — supervisor replies `NO <code>` to the batch SMS. Handled by `src/app/api/webhooks/twilio/sms-reply/route.ts` (currently does not include a structured reason — the reply itself is the dispute signal). Supervisor follow-up happens out-of-band (phone call, email, in-person).
2. **Web `/verify` page** — supervisor clicks the Query / Dispute action and types a reason into the form. Handled by `src/app/api/verify/dispute/[shiftId]/route.ts`. Reason is required, max 1000 chars.

(The `/command` dashboard also has a dispute endpoint at `src/app/api/command/shifts/[shiftId]/dispute/route.ts` for admin-initiated disputes. It's the rarer path — supervisor disputes are the primary mechanism. As of 2026-04-30 the `/command` admin-dispute does not call the worker-SMS helper; flagged for follow-up.)

### What happens (steps 1–6)

1. **WLES DISPUTE_RAISED event written** to `shift_events` with the supervisor's reason (or a sentinel for SMS NO replies that lack one), method tag, and server-derived supervisor identity.
2. **Shift status transition** `* → DISPUTED` (via `.neq('status', 'DISPUTED')` compound predicate for idempotency — second dispute is a no-op).
3. **Idempotency guard** — repeat-fire returns 409 ALREADY_DISPUTED.
4. **Payroll admin notified via email** — `notifyPayrollDispute` sends a Resend email summarising the dispute and the supervisor's stated reason. Failure logged but does not block.
5. **Worker notified via SMS** — `sendWorkerDisputeSms` (`src/lib/sms/worker-notify.ts`) sends an SMS to the worker with the receipt ID, hours, the supervisor's reason (truncated to 80 chars), and a link to the public receipt. Fire-and-forget; failure logged but does not roll back the WLES event. **As of 2026-04-30 this fires from the `/verify` path**; gap closed today per labour-hire-workflow-gap-analysis-2026-04-29 §2.7. SMS NO replies and `/command` admin-dispute do not currently notify the worker (follow-up).
6. **Resolution path is out-of-substrate.** The substrate captures the dispute as a sealed event; resolution happens via the supervisor and worker discussing, then either (a) the worker re-submits with adjusted hours (creates a new shift; the disputed shift remains DISPUTED in the audit trail), or (b) the supervisor re-approves the original via an admin-side ADJUSTED transition. There is no in-substrate dispute-resolution UI today — that's a future workflow-tool feature, not records-substrate scope.

### Worker-side observable
Within seconds: an SMS lands containing "Shift queried", the receipt ID, the supervisor's stated reason, and a link to the public receipt. The receipt page shows DISPUTED status. The worker contacts the supervisor (out-of-app) to resolve.

## Worker FAQ alignment

The worker FAQ at `src/content/worker/faq.md` "What does 'verified' mean?" (lines 104-110) describes the three things that make a shift verified: (1) tap recorded instantly, (2) GPS confirmed at site, (3) supervisor approved or flagged. This document is the canonical reference for (3).

The FAQ "What if my supervisor is away?" (lines 63–82, post 2026-04-29 reword) describes the dispute-or-no-response fallback path. The canonical answer per this document: if the supervisor neither approves nor disputes within 24 hours, FLOSMOSIS support handles manual escalation. The original automated email-fallback cron was disabled 2026-04-29 per substrate-DD audit; revival is gated on schema migration + status enum decision + tests.

## Substrate-DD invariants

This flow upholds three substrate invariants:

1. **WLES events are written before HTTP responses return.** SMS / email failures cannot revert the WLES event; the chain is the source of truth.
2. **Worker SMS is fire-and-forget.** Twilio outage cannot block approvals or disputes. Caller invokes via `void ...catch(...)` pattern.
3. **Server-derived identity for all WLES actor fields.** Body-supplied supervisor IDs are ignored; trust anchors are the SMS phone match (SMS-reply path) or the verify_token match (web path).

## Out-of-scope (flagged for review)

- **`/command` admin-dispute** does not currently notify the worker. Adding `sendWorkerDisputeSms` invocation would mirror the `/verify` path. ~10 lines.
- **`/command` payroll-stage approval** (SUPERVISOR_APPROVED → PAYROLL_APPROVED) does not notify the worker. Arguably correct — the worker already received an SMS at supervisor approval — but if Lauren wants the payroll milestone visible to workers, the same helper applies. Founder call.
- **SMS NO reply** does not capture a structured reason; the supervisor's NO is the dispute signal but the receipt page shows no reason text. Adding a follow-up "reason?" SMS exchange is a workflow-tool expansion; current records-substrate framing leaves this out-of-scope.
- **Dispute resolution UI** does not exist in-substrate. Resolution happens out-of-app. Adding resolution flows is a workflow-tool expansion.
