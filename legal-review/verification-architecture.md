# Three-layer verification — how a WOHJO shift becomes payable

**Audience:** Lauren's Privacy Policy clause 3.5, customer-facing
explainer asset, and internal reference. One page.

**Core claim:** no hour reaches payroll on a single point of truth.
Every shift passes through three independent checks before WOHJO will
let it into the Employment Hero export.

---

## Layer 1 — Worker at the site (GPS geofence + phone-OTP auth)

**What it proves:** the worker is who they said they are, and they
physically arrived at the site the company assigned them to.

**Mechanism in code:**
- Worker signs into the WOHJO Field PWA with their mobile phone
  number. Supabase Auth sends an OTP by SMS (Twilio), worker types
  the code. Authentication is phone-as-capability — the only way
  through Layer 1 is to hold the specific mobile the admin
  registered.
  Source: `src/app/(field)/field/page.tsx` (`supabase.auth.signInWithOtp`).
- On `/field/home`, once the worker grants location permission, the
  React hook `useGeofenceWatch` subscribes to `navigator.geolocation.watchPosition`.
  When the worker's coordinates are inside the site's circular
  geofence (centre = `sites.geofence_lat/lng`, radius bounded by
  Day 3 P3 to 50–1000 metres), a single `geofence_events` row is
  written with the detection timestamp and confidence (`HIGH` / `MEDIUM`;
  `LOW` detections are suppressed).
  Source: `src/lib/intelligence/useGeofenceWatch.ts`.
- **Privacy constraint baked in:** the watcher short-circuits after
  the first detection of the day (`detectedThisSessionRef` guard,
  line 73 & 119) and is torn down when the page unmounts. The
  product never records a continuous location trail.

**What it does NOT prove:** that the worker stayed the full day, or
that they did the work. Layer 1 is arrival, no more.

---

## Layer 2 — Site supervisor (SMS or WOHJO Verify confirmation)

**What it proves:** a second human, with their own mobile number on
file, saw the worker on site and is willing to affirm their hours.

**Mechanism in code:**
- Every morning at 06:30 AEST the scheduled cron
  `/api/cron/supervisor-batch` (`src/app/api/cron/supervisor-batch/route.ts`)
  sends each active supervisor a summary SMS listing that day's
  submitted shifts by short code (e.g. `Mo-A3`, `Joao-B1`). Twilio
  delivers the SMS.
- The supervisor replies with one of four commands in the SMS:
  - `YES ALL` — approve every shift with zero HIGH or MEDIUM anomaly
    flags. The CLAUDE.md rule (Non-Negotiable #14) explicitly
    forbids `YES ALL` from approving anomaly-flagged shifts; those
    always require a per-code decision.
  - `YES <code>` — approve the named shift only.
  - `NO <code>` — dispute the named shift (triggers review).
  - `HELP` — returns command-list and a URL to the WOHJO Verify web
    UI backup.
- Twilio posts the inbound SMS to `/api/webhooks/twilio/sms-reply`.
  Route does: (1) rate-limit, (2) Twilio signature validation, (3)
  idempotency check by `MessageSid`, (4) supervisor lookup by
  sending phone, (5) command parse, (6) approve/dispute writes.
  Source: `src/app/api/webhooks/twilio/sms-reply/route.ts`.
- A `SUPERVISOR_APPROVAL` or `DISPUTE_RAISED` WLES event is written
  to `shift_events` with a fresh SHA-256 hash linked to the previous
  event's hash. The chain is later verified by `/api/cron/verify-hashes`.

**Backup path:** `/verify` is a web UI accessible via a per-supervisor
verify token, used when the supervisor prefers to tap through the
shifts visually instead of SMS. Same downstream events written. The
SMS path is the primary mechanism per CLAUDE.md #15.

**What it does NOT prove:** payroll compliance or award-rate
correctness. Layer 2 confirms presence and agreed hours.

---

## Layer 3 — Labour-hire payroll admin (WOHJO Command sign-off)

**What it proves:** the labour-hire company's own payroll admin
reviewed the supervisor-approved shifts against their internal
records (rostering, sick leave, award classification) and signed off
for export.

**Mechanism in code:**
- Payroll admin logs into `/command` (auth-gated by Next.js 16 proxy
  at `src/proxy.ts`; currently Supabase session cookie; Day 3 P1 adds
  an `admins` table with role-based company membership).
- Admin sees supervisor-approved shifts at `/command/approvals`
  (which displays `status = SUPERVISOR_APPROVED` shifts) and
  reviews each. Anomaly flags raised by WOHJO Intelligence are
  surfaced inline.
- Admin clicks `Approve` (fires `POST /api/command/shifts/[shiftId]/approve`).
  A `SUPERVISOR_APPROVAL` event already exists from Layer 2; the
  admin's approval writes a distinct admin approval + updates
  `shifts.status` to `PAYROLL_APPROVED`.
  Source: `src/app/api/command/shifts/[shiftId]/approve/route.ts`.
- When the payroll period closes, admin goes to `/command/export`
  and triggers a CSV export for Employment Hero (currently the only
  formatter wired). `POST /api/command/export` fetches every
  `PAYROLL_APPROVED` shift in the period, runs
  `/lib/export/formatters/employment-hero.ts` against them, writes
  an `EXPORT_RECORD` WLES event per shift with the final file hash
  (`exports.file_hash`), and returns the CSV.
  Source: `src/app/api/command/export/route.ts`.
- Employment Hero ingests the CSV on the labour-hire company's side.
  Only `PAYROLL_APPROVED` shifts flow through; the export formatter
  asserts this precondition (`employment-hero.ts:113`).

**What Layer 3 does NOT do:** issue payments. WOHJO never touches a
bank account. Payroll execution happens downstream in Employment
Hero.

---

## The audit trail that ties the three layers together

Every state transition above is a row in `shift_events`:

| Event type | Layer | Written by |
|---|---|---|
| `START_EVENT` | 1 (worker clocks in) | `/api/field/shift/start` |
| `END_EVENT` / `SHIFT_COMMIT` | 1 | `/api/field/shift/end` |
| `SUPERVISOR_APPROVAL` | 2 | Twilio webhook or `/api/verify/approve/[shiftId]` |
| `DISPUTE_RAISED` | 2 | Twilio NO-command or `/api/verify/dispute/[shiftId]` |
| `ANOMALY_FLAG` / `INTELLIGENCE_CLEAR` | 1.5 (between worker submission and supervisor review) | `/api/intelligence/analyse/[shiftId]` |
| *(admin approval writes a separate admin row in `admin_access_log`, not a WLES event)* | 3 | `/api/command/shifts/[shiftId]/approve` |
| `EXPORT_RECORD` | 3 (final) | `/api/command/export` |

Every event carries a SHA-256 hash keyed to the previous event's hash.
The nightly `/api/cron/verify-hashes` (03:00 AEST, see `src/app/api/cron/verify-hashes/route.ts`)
recomputes every company's chain end-to-end and emails Lauren if any
link is broken.

This is the fourth, quiet layer — integrity verification of the
three human layers. Tampering anywhere in the chain trips the alert
within 24 hours of occurrence.

---

## Why three layers (vs one)

Legal intent: the Privacy Policy's clause 3.5 needs to ground its
claim that FLOSTRUCTION is a "verification platform", not a
time-keeping service. Verification means: independent attestations
from different actors with skin in the game. One layer is a claim;
two is a check; three is an audit.

Operational intent: labour-hire payroll is the single most
dispute-intensive part of the industry. The WOHJO design pushes the
disputation up-front where it's cheap (supervisor corrects the
shift, or worker edits, or admin flags) rather than down-stream
where it's expensive (chargeback, wage-theft claim, Fair Work Ombudsman
intervention).

Code intent: the three layers are independently owned in the tree
(`/field`, `/verify` + Twilio webhook, `/command`) and talk only
through the WLES event ledger. Breaking any one layer doesn't
corrupt the others.

---

## Limitations to acknowledge (for accurate Privacy Policy wording)

1. Layer 1 GPS is opt-in. A worker can decline location permission
   and submit manually. That shift then reaches Layer 2 without
   geofence evidence; WOHJO Intelligence flags it
   `GPS_UNAVAILABLE` at MEDIUM severity. It is still approvable but
   the confidence score is lower.

2. Layer 2 SMS relies on Twilio delivery. If Twilio is down, the
   supervisor-batch doesn't fire and shifts sit at `SUBMITTED`
   status until the supervisor uses the Verify web UI directly.
   Layer 2 is therefore "preferred SMS, fallback Verify UI".

3. Layer 3 admin approval uses session cookies today; the Day 3
   P1 work introduces a proper `admins` table with role-scoped
   access. Until that ships, the admin role is a flat "authenticated
   session with access to /command".

4. Hash-chain verification runs daily, not per-request. A tamper
   window of up to 24 hours exists between the event and the alert.
   Acceptable for the current scale; per-request verification is a
   Day 4+ decision if ever needed.

All four of these are worth explicitly stating in the Privacy Policy
3.5 clause so the verification claim is accurate rather than
aspirational.
