# Subprocessor list — post Day 3 P2 end state

**Purpose:** source of truth for Privacy Policy §7.2 (current numbering
of the FLOSTRUCTION Privacy Policy draft; may shift during Lauren's
red-pen session — the list content is what matters).

**Status:** this document describes the END STATE after Day 3 Priority 2
completes (Formspree removed, Google Fonts self-hosted, Unsplash
replaced). Items marked *(pending today)* reflect work in flight.

---

## Active subprocessors

| Service | Purpose | Data region | Data types shared | Status |
|---|---|---|---|---|
| **Supabase** | Database-as-a-service (Postgres + Auth + Storage) | `ap-southeast-2` (Sydney) — confirm in Supabase Dashboard → Project Settings → General | All Customer Data, Worker Data (name, phone, email, employee_id, pay_rate), Shift Data (timestamps, GPS, hours, notes), WLES event hashes, admin actions, founding leads, webhook idempotency keys, contact form submissions (post-P2.1) | Active |
| **Twilio** | SMS delivery (supervisor batch SMS, worker phone OTP) | USA (Twilio's API endpoints); SMS carrier routing in AU | Worker mobile numbers, supervisor mobile numbers, SMS bodies (short shift codes, YES/NO/HELP commands), Twilio `MessageSid` for idempotency | Active |
| **Resend** | Transactional email (founding-lead confirmation, chain-integrity alerts, payroll-admin supervisor notifications, contact-form receipts post-P2.1) | USA — Resend infrastructure runs on AWS SES `us-east-1` | Recipient email addresses, email subjects and bodies (worker names, shift summaries, alert details, contact-form message content) | Active |
| **Vercel** | Application hosting (Next.js 16 app, Edge + serverless functions, static assets) | USA / Australia (Vercel's global edge network) | All request traffic during SSR and API route execution; build artefacts; application logs (pino stdout); environment variables at runtime | Active |
| **Cloudflare R2** *(pending this week)* | Off-platform Postgres backup storage | APAC (user-selected bucket region) | Daily `pg_dump` of the full Supabase database; SHA-256 companion file | Pending deployment per `docs/A7-execution-checklist.md` |
| **Railway** *(pending this week)* | Scheduled job runner for A7 backup cron | USA (Railway default) | Nothing persistent; the cron service runs `pg_dump` against Supabase direct-connect URL and pushes the output to R2 | Pending |

## Removed / eliminated during Day 3 P2

| Service | Previously | Replaced by | Status |
|---|---|---|---|
| **Formspree** | Landing-page contact form target (`NEXT_PUBLIC_FORMSPREE_ID`) | `/api/contact` route (this repo) → Resend email to `contact@flosmosis.com` | Removed today (P2.1) |
| **Google Fonts** | Web font CDN for IBM Plex Mono / Sans / Serif | Self-hosted `woff2` files under `/public/fonts/`, loaded via `next/font/local` | Removed today (P2.2) |
| **Unsplash** | Hero / worker / manager / hire imagery on marketing landing page | Self-hosted placeholder SVGs under `/public/placeholders/` OR Batch-11 approved imagery under `/public/images/batch-11/` | Removed today (P2.3) |

## Services in the plan but NOT yet wired

| Service | When it becomes active | Data types |
|---|---|---|
| **Stripe** | When Lauren's business bank account is linked; product is pre-launch so Stripe is not yet used | Customer payment method metadata (NEVER card numbers — handled by Stripe); payment event IDs for idempotency |

## Services NEVER used

These are listed to pre-empt questions Lauren's counsel might ask during
review:

- **No Google Analytics, Mixpanel, Amplitude, Segment, Plausible, PostHog, Fathom, or any analytics provider** — `grep` on `package.json` and `package-lock.json` returns zero hits. Site visitor behaviour is not tracked by third parties.
- **No advertising SDK, no pixel (Meta / Google / TikTok / LinkedIn).** No marketing-automation (Marketo / HubSpot / Pardot).
- **No social login / OAuth connector** other than Supabase Auth phone OTP. No Google Sign-In, Apple Sign-In, Facebook Login.
- **No customer-support chat widget** (no Intercom, Zendesk, Drift, Crisp).
- **No CDN for user uploads** — there are no user uploads.
- **No biometric / face / voiceprint service.** Exhaustively audited per `legal-review/selfie-truth.md`.
- **No SMS aggregator other than Twilio.** No Vonage, Plivo, MessageBird.
- **No email provider other than Resend.** No SendGrid, Mailgun, Postmark, AWS SES directly.
- **No error-tracking / APM service.** No Sentry, Rollbar, Datadog, New Relic. Errors surface in Vercel logs + pino stdout only.
- **No feature-flag service.** No LaunchDarkly, Statsig, GrowthBook.
- **No live-streaming or media service.** No Mux, Cloudinary, Livepeer.

## Data-residency notes

- Supabase region must be confirmed. The WOHJO Supabase project was provisioned on Supabase Cloud. If the region is `ap-southeast-2` (Sydney), Australian customer data never leaves AU soil. If the region is `us-east-1` or similar, disclosure needs to say so. Lauren should confirm in Supabase Dashboard → Project Settings → General → Region.
- Twilio SMS: API endpoints are US-based but SMS carrier routing is in Australia (Twilio's AU messaging service). For APP 8 purposes, treat Twilio as a US subprocessor with an AU delivery leg.
- Resend: US-based (AWS SES us-east-1 under the hood).
- Vercel: edge network is global; cache layer may serve static assets from AU edge nodes. Serverless function execution region is configured per project — typically the home region (US) unless changed. Confirm in Vercel Project Settings → Functions → Region.

## What Lauren needs to confirm before publishing

1. Supabase project region.
2. Vercel serverless function region.
3. Contact-form inbox address (`contact@flosmosis.com` assumed; confirm MX is set up).
4. Whether to disclose the pending Cloudflare R2 + Railway additions now or wait until they're live.
5. Whether to include a placeholder note about Stripe ("payment processor — to be added when pricing goes live") or leave silent until the integration actually ships.
