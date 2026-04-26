# What FLOSTRUCTION actually collects — code-verified inventory

**Purpose:** Cross-reference source for Lauren's morning Privacy Policy
red-pen session. Every row is derived from `src/db/schema.ts` and
source-tree `grep`. Claims in the Privacy Policy draft should match
this table exactly.

**Audit baseline:** codebase state 2026-04-22 08:30 AEST.

---

## Table A — What we collect

| Data type | Collected? | Source surface | Storage | Retention |
|---|---|---|---|---|
| **Worker given name** | ✅ Yes | `workers.first_name` (admin enters at onboarding) | Supabase `workers` | Indefinite while `is_active=true`; soft-deactivated not deleted |
| **Worker family name** | ✅ Yes | `workers.last_name` | Supabase `workers` | Same as above |
| **Worker mobile phone** | ✅ Yes | `workers.phone`; also authentication factor via Supabase Auth phone OTP | Supabase `workers` + `auth.users` | Same as above |
| **Worker email** | ⚠ Optional | `workers.email` (nullable) | Supabase `workers` | Same as above |
| **Worker employee ID** | ✅ Yes | `workers.employee_id` — required for Employment Hero payroll export | Supabase `workers` | Same as above |
| **Worker pay rate** | ✅ Yes | `workers.pay_rate` decimal(10,2) | Supabase `workers` | Same as above |
| **Worker award classification** | ⚠ Optional | `workers.award_classification` (nullable) | Supabase `workers` | Same as above |
| **GPS coordinates — geofence crossing** | ✅ Yes, once per worker per day | `geofence_events.lat`, `.lng` captured only when worker crosses site radius; foreground-only per `useGeofenceWatch` | Supabase `geofence_events` | Indefinite unless worker requests erasure |
| **GPS coordinates — clock-in / clock-out** | ⚠ Optional (worker can deny location permission) | `shift_events.gps_lat`, `.gps_lng`, `.gps_accuracy_metres`; body params on `/api/field/shift/start` and `/api/field/shift/end` | Supabase `shift_events` | Same |
| **Supervisor name** | ✅ Yes | `supervisors.name` (admin enters) | Supabase `supervisors` | Same |
| **Supervisor phone** | ✅ Yes — SMS destination | `supervisors.phone`; used by `/api/cron/supervisor-batch` | Supabase `supervisors` | Same |
| **Supervisor email** | ⚠ Optional | `supervisors.email` | Supabase `supervisors` | Same |
| **Shift start time** | ✅ Yes | `shifts.start_time`, `shift_events.event_data.worker_confirmed_start_at` | Supabase `shifts`, `shift_events` | Indefinite; immutable chain |
| **Shift end time** | ✅ Yes | `shifts.end_time` | Supabase `shifts` | Same |
| **Shift break minutes** | ✅ Yes | `shifts.break_minutes` | Supabase `shifts` | Same |
| **Shift total hours** | ✅ Yes | `shifts.total_hours` decimal(5,2), computed | Supabase `shifts` | Same |
| **Worker note on shift** | ⚠ Optional | `shifts.worker_note`; freeform text from Field PWA | Supabase `shifts` | Same |
| **Device metadata** | ✅ Yes | `shift_events.device_metadata` jsonb; captures user-agent fragment and session id for audit; NOT fingerprinting | Supabase `shift_events` | Same |
| **Anomaly flags / confidence scores** | ✅ Yes, computed by Intelligence rules | `shifts.anomaly_flags` jsonb, `shifts.confidence_score` | Supabase `shifts` | Same |
| **WLES hash chain (SHA-256)** | ✅ Yes | `shift_events.event_hash`, `shift_events.previous_event_hash`; provenance integrity | Supabase `shift_events` | Indefinite; immutable |
| **SMS message content (inbound)** | ✅ Yes | Twilio webhook body; stored as an event row in `shift_events` when it triggers an approval/dispute | Supabase `shift_events` | Indefinite; immutable |
| **SMS delivery metadata** | ⚠ Transient | Twilio `MessageSid` in `webhook_idempotency` for replay guard; not persisted in `shift_events` | Supabase `webhook_idempotency` | Indefinite currently; Day 2+ housekeeping retention sweep planned |
| **Email delivery metadata** | ⚠ Transient | Resend delivery receipts — NOT written to our DB; remain on Resend's side | — | Resend's retention policy |
| **Company name** | ✅ Yes | `companies.name` | Supabase `companies` | Indefinite while active |
| **Company ABN** | ✅ Yes | `companies.abn` | Supabase `companies` | Same |
| **Company contact email** | ✅ Yes | `companies.contact_email` | Supabase `companies` | Same |
| **Company contact phone** | ⚠ Optional | `companies.contact_phone` | Supabase `companies` | Same |
| **Admin session cookie** | ✅ Yes | Supabase Auth cookie (`sb-...-auth-token`) | Browser (httpOnly) + Supabase Auth | Session lifetime |
| **Admin `user_id` → `company_id` mapping** | 🟡 Pending Day 3 migration | Will land in new `admins` table per Day 3 P1 | Supabase `admins` | Indefinite while active |
| **Founding lead submissions** | ✅ Yes | Landing page `/founding` form: `founding_leads.phone, company_name, contact_name, worker_count, spot_number` | Supabase `founding_leads` | Indefinite currently |
| **Export audit records** | ✅ Yes | `exports.file_hash`, `.total_hours`, `.total_shifts`, `.shift_ids` | Supabase `exports` | Indefinite; audit trail |
| **Admin action audit log** | ✅ Yes | `admin_access_log` — every admin read/export/impersonate/delete/update/alert | Supabase `admin_access_log` | Indefinite; immutable |
| **Webhook idempotency keys** | ✅ Yes | `webhook_idempotency` — MessageSid, Stripe evt, etc. | Supabase `webhook_idempotency` | Indefinite currently |
| **Landing-page contact form submissions** | ⚠ Pending P2.1 migration today | Formspree currently; migrating to new `/api/contact` + Resend | Supabase (new table) | Indefinite (to be decided by Lauren) |

---

## Table B — What we DO NOT collect

| Data type | Not collected | Why (verification source) |
|---|---|---|
| **Selfie photos / face images** | ❌ Not collected | No camera APIs called (`grep getUserMedia` 0 hits); confirmed in `legal-review/selfie-truth.md` |
| **Biometric templates / fingerprints / faceprints** | ❌ Not collected | Same — no biometric code paths exist, no mobile native build exists |
| **Voice recordings** | ❌ Not collected | No `MediaRecorder` or `AudioContext` audio capture |
| **Continuous GPS trail** | ❌ Not collected | `useGeofenceWatch.ts:73` `detectedThisSessionRef` guard bails after first boundary crossing; watcher cleaned up on page unmount |
| **Background location** | ❌ Not collected | No "always allow" or background-geolocation request; pure web PWA with no native build |
| **Bank account / BSB / payment card data** | ❌ Not collected | No Stripe or payment integration in code today; blocked on bank account per CLAUDE.md |
| **Tax File Number (TFN) / Social Security** | ❌ Not collected | No column, no input field, no form |
| **Passport / driver's licence images** | ❌ Not collected | Same — no image-upload paths |
| **Health / medical data** | ❌ Not collected | No column, no form |
| **Sexual orientation / religious / political** | ❌ Not collected | No column, no form |
| **Union membership** | ❌ Not collected | No column, no form |
| **Criminal record** | ❌ Not collected | No column, no form |
| **Worker home address** | ❌ Not collected today | `workers` has no address columns (only phone and email) |
| **Employment Hero customer ID** | ❌ Not collected | We export AGAINST Employment Hero via CSV; we do not collect the customer's Employment Hero identifier beyond what admin enters as `employee_id` |
| **Third-party analytics identifiers** | ❌ Not collected | No Google Analytics, Mixpanel, Amplitude, Segment, Plausible, PostHog in `package.json` |
| **Advertising identifiers / IDFA / GAID** | ❌ Not collected | No native build; no mobile advertising SDK |
| **Cookies for tracking / ad retargeting** | ❌ Not used | Only cookies set are Supabase Auth session cookies |
| **Social logins / OAuth connections** | ❌ Not used | Auth is phone-OTP only for workers; email-password for admins; no Google/Apple/Facebook sign-in |

---

## Table C — Data sources

| Source | What enters the system via this source | Role |
|---|---|---|
| **Admin form at `/command/workers`** | Worker record (name, phone, email, employee_id, pay_rate, award) | Direct admin input |
| **Admin form at `/command/sites`** | Site record (name, address, lat/lng, geofence radius) | Direct admin input |
| **Admin form at `/command/supervisors`** | Supervisor record (name, phone, email) | Direct admin input |
| **Worker phone at `/field`** | Phone OTP auth; GPS on grant | Worker self-consent |
| **Worker `/field/home`** | Shift start/end timestamps, GPS (optional), worker note | Worker self-consent |
| **Supervisor SMS reply (Twilio webhook)** | `YES ALL`, `YES <code>`, `NO <code>`, `HELP` command body | Supervisor action |
| **Supervisor `/verify` UI** | Supervisor approval / dispute via web interface (fallback) | Supervisor action |
| **Cron jobs** | Hash-chain verification results; keepalive pings; supervisor batch SMS timings; approval fallbacks | System-generated |
| **Intelligence rules engine** | Anomaly flags, confidence scores computed from above inputs | Derived |
| **Landing page `/founding`** | Founding customer lead (phone, company, contact, worker count) | Prospect self-consent |
| **Landing page contact form** (current Formspree, migrating to `/api/contact`) | Name, email, message | Prospect self-consent |

---

## Table D — Retention — current state

| Category | Current retention | Target |
|---|---|---|
| Personal info linked to a live worker | Indefinite while `is_active=true`; on deactivation, soft-delete (row retained, `is_active=false`, `deactivated_at` timestamp planned) | To be defined in Privacy Policy §8 by Lauren |
| WLES audit trail | Indefinite; immutable by design (no UPDATE, no DELETE enforced at app layer, RLS blocks anon access) | Indefinite — legal audit basis |
| Admin access log | Indefinite; immutable | Indefinite |
| Webhook idempotency keys | Indefinite currently | 30-day sweep planned per `idempotency-usage.md` |
| Founding leads | Indefinite | Lauren's call |
| Contact form submissions (post-P2.1) | Indefinite (to be decided) | Lauren's call |

---

## Notes for the Privacy Policy red-pen session

1. **GPS coordinates are "personal information" under the Privacy Act 1988 (Cth)** — NOT sensitive information (s 6(1) reserves the sensitive category for biometrics / health / etc.). The privacy page at `src/app/privacy/page.tsx:309` already says this correctly.

2. **Retention language in the Privacy Policy should distinguish:**
   - Shift-event audit trail (indefinite, immutable — legal basis)
   - Personal info of deactivated workers (retain for 7 years consistent with Fair Work Act record-keeping obligations — or confirm with Lauren's lawyer).
   - Webhook idempotency (can be 30 days; operational only).

3. **No selfie / biometric clause needed** — see `legal-review/selfie-truth.md` for the exhaustive audit.

4. **Subprocessors post-Day 3 P2:** Formspree gone, Google Fonts self-hosted, Unsplash replaced. See `legal-review/subprocessor-list-final.md` for the final list.

5. **The default geofence radius is 200m** but there is no server-side cap today. Day 3 P3 adds `CHECK 50 ≤ radius ≤ 1000`. Privacy Policy can claim "geofence is bounded at 1 km maximum" only AFTER P3 completes.
