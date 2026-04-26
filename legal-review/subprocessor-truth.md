# Subprocessor list — code truth

Investigation answering the Terms of Service note 2.3 question:
every external service the codebase touches, cross-checked against
the Privacy Policy subprocessor table (`src/app/privacy/page.tsx`
§6.2 at lines 229–254).

## External services invoked from code

Derived from `package.json` runtime deps + environment variables + hard-coded base URLs.

| # | Service | Evidence | Data flowing to the service |
|---|---|---|---|
| 1 | **Supabase** | `@supabase/ssr`, `@supabase/supabase-js` deps; `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` + `DATABASE_URL` env vars; every route in `src/app/api/*` | All DB data (companies, sites, workers, supervisors, shifts, shift_events, exports, webhook_idempotency, admin_access_log, geofence_events, founding_leads), all OTP auth flows |
| 2 | **Twilio** | `twilio` dep; `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` env vars; `src/lib/twilio/client.ts`; supervisor batch SMS in `src/app/api/cron/supervisor-batch/route.ts`; inbound webhook `/api/webhooks/twilio/sms-reply` | Worker phone numbers (inbound/outbound SMS), supervisor phone numbers, SMS bodies (shift receipt codes, approval commands) |
| 3 | **Resend** | `resend` dep; `RESEND_API_KEY` env var; `src/lib/email/notify.ts` | Lauren's email, payroll admin emails, supervisor names, shift summaries, chain-integrity alert bodies, founding-lead notifications |
| 4 | **Vercel** | Implicit host; `VERCEL_ENV`, `VERCEL_OIDC_TOKEN` env vars; `next` 16.2.3 dep | All request traffic, app logs, build artefacts |
| 5 | **Formspree** | `NEXT_PUBLIC_FORMSPREE_ID` env var; `src/components/shared/LandingPage.tsx` POSTs to `https://formspree.io/f/${formId}` | Marketing-site contact form submissions (name, email, message) |
| 6 | **Google Fonts** | `https://fonts.googleapis.com/css2?family=Barlow` stylesheet link (if still present) | Stylesheet request — includes referring URL + user agent + IP; no personal-info payload |
| 7 | **Unsplash** | `https://images.unsplash.com/...` hard-coded image URLs in `src/components/shared/LandingPage.tsx:33–36` | Image requests from browser — includes referring URL + user agent + IP of the landing-page visitor |

## Secondary external references (referenced but not invoked)

| # | Reference | Where | Flow |
|---|---|---|---|
| a | MYOB AccountRight API | Employment Hero export formatter notes in `src/lib/export/formatters/*`; no code actually calls it | — |
| b | Xero Payroll AU API | Same — documentation comment only | — |
| c | OAIC (Office of the Australian Information Commissioner) | Hyperlink in Privacy Policy page | — |

## Cross-check against Privacy Policy §6.2

Privacy Policy currently lists FOUR subprocessors:

| Privacy Policy row | Matched in code? | Notes |
|---|---|---|
| Twilio | ✅ Yes | Match. PP says USA; Twilio's SMS is routed via AU number but API endpoints are in the US — accurate. |
| Supabase | ✅ Yes | Match. PP says "Australia / USA (depending on instance configuration)" — the WOHJO project is Supabase `rwnxnnudljpgyfwbnosu.supabase.co`; region is not visible from code. Worth Lauren confirming the region in Supabase dashboard → Project Settings → General. |
| Resend | ✅ Yes | Match. PP says USA. Resend infra is on AWS SES (`amazonses.com`) in us-east-1 by default. |
| Vercel | ✅ Yes | Match. PP says "USA / Australia (edge network)" — accurate. |

### ⚠ Subprocessors in code but NOT in the Privacy Policy

Three present. In order of data-sensitivity:

1. **Formspree** — *marketing-site contact form*. Collects name, email,
   free-text message from prospects who submit the landing-page form.
   Sender data is Personal Information under the Privacy Act. The
   landing-page visitor is arguably NOT a "Worker" but is a data
   subject from whom we're collecting PI.
   - **Privacy Policy gap:** Formspree is not named. Either add it
     to §6.2 or migrate the form to submit directly to Supabase
     (`founding_leads` table already exists — in fact the founding
     form already does this). The marketing LandingPage form may be
     legacy.
   - **Code note:** the founding form (`/founding` page) uses the
     `/api/founding` route and lands in Supabase `founding_leads` —
     that one does NOT touch Formspree. But the generic Marketing
     LandingPage (`src/components/shared/LandingPage.tsx`) does.

2. **Google Fonts** — *style asset*. Loads a CSS file from
   `fonts.googleapis.com`. Google's servers log the IP + user-agent
   + referer of every request. No personal-info payload goes to
   Google, but the visitor's IP and the page URL are visible to
   Google as an unavoidable side-effect of loading the stylesheet.
   - **Privacy Policy gap:** arguably should be named as a
     third-party tracker (some counsel treat font-CDN requests as
     a regulated disclosure, especially under EU GDPR — less
     settled under AU APPs). Lauren/her lawyer call.
   - **Mitigation option:** self-host the Barlow font files and
     drop the Google dependency. Low effort (Barlow is Open Font
     License).

3. **Unsplash** — *image CDN*. Loads hero/worker/manager/hire
   images from `images.unsplash.com`. Same shape as Google Fonts —
   Unsplash logs the IP/user-agent/referer of every visitor.
   - **Privacy Policy gap:** same as Google Fonts — third-party
     content CDN, no personal-info payload, but request-log
     visibility.
   - **Mitigation option:** mirror the four images locally under
     `public/` and stop calling Unsplash.

### Subprocessors in the Privacy Policy but NOT in code

None. The four listed (Twilio, Supabase, Resend, Vercel) all have
code evidence.

## Summary for the Terms of Service drafting note 2.3

| Statement | Code-truth |
|---|---|
| The code communicates with exactly Twilio, Supabase, Resend, and Vercel (as Privacy Policy §6.2 implies). | **False.** Three more external services are called: Formspree, Google Fonts, Unsplash. |
| Formspree receives contact-form Personal Information. | **True** (legacy marketing landing page only; founding form is Supabase-direct). |
| Google Fonts and Unsplash expose visitor IP + referer to third parties. | **True** — inherent to CDN stylesheet/image loading. |
| There is no payment processor in the code today. | **True.** `stripe` is not a dep. No `@stripe/*` imports. No `STRIPE_*` env vars. Privacy Policy §5.1 mentions "Payment information (processed via third-party payment provider)" but the payment provider is not actually wired yet — consistent with CLAUDE.md that Stripe is blocked on the bank account. |
| There is no analytics provider in the code today. | **True.** No Google Analytics, Plausible, PostHog, Mixpanel, Amplitude, Segment, or similar. `grep` returns zero hits. |

## Recommendations for Lauren

1. Either add Formspree + Google Fonts + Unsplash to Privacy Policy
   §6.2, **or** eliminate the three dependencies from the marketing
   surface (all are avoidable):
   - Self-host Barlow (Open Font License).
   - Mirror the four Unsplash images to `/public/images/`.
   - Route the marketing contact form through a new Supabase table
     (`marketing_inquiries`) + `/api/marketing/inquiry` route.
2. When Stripe goes live, add it to §6.2 **and** §5.1 (replace "via
   third-party payment provider" with the specific name).
3. If you introduce analytics later, it's a new §6.2 row.

**No subprocessors found in code that are undocumented from the
Terms of Service perspective beyond the three above.**
