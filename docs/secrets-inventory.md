# WOHJO secrets & configuration inventory — W6/SG-7

**Maintained by test:** `tests/substrate/w6-sg7-secrets-inventory.test.ts`
walks every `process.env.*` reference in `src/` and fails CI if a name
is missing from this document. The inventory cannot silently rot.

Local credentials live in `WOHJO_credentials.txt` (gitignored — PR #60).
All values below are set in Vercel → Settings → Environment Variables
unless noted. Rotation rule of thumb: rotate on suspicion immediately;
otherwise per the cadence column. After any rotation, redeploy.

## Secrets (rotate-able, never client-visible)

| Name                                            | Used by                                                                                                     | Rotation                                                                                                                                       |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| SUPABASE_SERVICE_ROLE_KEY                       | `src/lib/supabase/server.ts` ONLY (the chokepoint; W5 closed the last three direct holders)                 | Supabase dashboard → API keys → regenerate; update Vercel; redeploy. Rotate if any function log ever echoes it (it must not).                  |
| SUPABASE_HOOK_SECRET                            | auth/events/hook signature verification                                                                     | Supabase Auth hooks config; paired update (Supabase + Vercel).                                                                                 |
| STRIPE_SECRET_KEY                               | checkout, admin/stripe-mode, welcome flow                                                                   | Stripe dashboard → roll key; Stripe supports dual-active during rotation.                                                                      |
| STRIPE_WEBHOOK_SECRET                           | stripe/webhook signature                                                                                    | Stripe dashboard → webhook endpoint → roll secret.                                                                                             |
| STRIPE_CLIENT_REF_SECRET                        | checkout client-reference HMAC                                                                              | Self-issued: generate new 32B, update Vercel; in-flight checkouts spanning the swap will fail verification — rotate in a quiet window.         |
| TWILIO_AUTH_TOKEN                               | twilio client + inbound signature validation                                                                | Twilio console → auth token roll (primary/secondary supported).                                                                                |
| ANTHROPIC_API_KEY                               | Ask (Phase 3) — /api/page/ask grounded answers over the record                                              | Anthropic console → rotate key; absent = Ask renders "not connected" (graceful).                                                               |
| TWILIO_ACCOUNT_SID                              | twilio client                                                                                               | Identifier, not a secret per se; rotate only with account change.                                                                              |
| CRON_SECRET                                     | all 8 cron routes (Bearer)                                                                                  | Self-issued: new random value in Vercel; Vercel Cron sends it automatically.                                                                   |
| RESEND_API_KEY                                  | email notify/welcome/contact/MFA                                                                            | Resend dashboard → API keys.                                                                                                                   |
| SLACK_ERROR_WEBHOOK_URL                         | observability shim + ops alerts                                                                             | Slack app → regenerate webhook. Shim no-ops if absent.                                                                                         |
| DATABASE_URL                                    | `src/db/client.ts` (Drizzle; server-side) + `src/app/api/preview-login/route.ts` (auth.users email restore) | Supabase connection string; rotate DB password via dashboard.                                                                                  |
| FLOS_PREVIEW_LOGIN                              | `src/app/api/preview-login/route.ts` — PREVIEW-ONLY director auto-login (route 404s unless `='1'`).         | Not a secret value (flag only); set on the **Preview** scope to enable, MUST be absent/unset on **Production**. Remove from Vercel to disable. |
| PGURL_PROD_READONLY (GitHub secret, not Vercel) | drift-gate CI (`drift_gate_ro`, **expires 2026-09-10** — founder queue)                                     | Re-provision per `scripts/.116c` runbook; credentials-only secret, TLS pinned in workflow source.                                              |

## Config (not secret, still operator-owned)

| Name                                                                                                                                       | Used by                                                           | Notes                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NEXT_PUBLIC_APP_URL                                                                                                                        | webhook signature URL, SMS links, crons                           | Must exactly match Twilio console webhook URL.                                                                                                                                        |
| NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY                                                                                   | client + server Supabase                                          | Public by design (anon key is RLS-bound).                                                                                                                                             |
| NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY                                                                                                         | checkout client                                                   | Public by design.                                                                                                                                                                     |
| ALERT_EMAIL_TO / SUPPORT_EMAIL_TO / CONTACT_EMAIL_TO / CONTACT_EMAIL_FROM / STANDARDS_EMAIL_TO / STANDARDS_EMAIL_FROM / WELCOME_EMAIL_FROM | email routing                                                     | Operator addresses.                                                                                                                                                                   |
| TWILIO_FROM_NUMBER                                                                                                                         | worker/supervisor SMS                                             | Twilio number.                                                                                                                                                                        |
| WLES_V1_ENABLED                                                                                                                            | WLES v1 path flag                                                 | Fail-closed default (v0). Flipping is a substrate decision, not config hygiene.                                                                                                       |
| PAYRUN_RUN_ENABLED                                                                                                                         | run-when-safe execution flag (`src/lib/payruns/run-readiness.ts`) | Fail-closed default (off). A READY run returns 423 until set `true`; flipping it to move real money is a founder go-live decision, recorded in the decision log — not config hygiene. |
| LOG_LEVEL / NODE_ENV / VERCEL_ENV / VERCEL_URL                                                                                             | logging/runtime                                                   | Platform-provided or tuning.                                                                                                                                                          |

## Standing rules

1. Service-role key is server-side only and reachable ONLY through
   `src/lib/db/service-client.ts` (ESLint error + w14g global walk
   enforce this two ways — W1.4/W5).
2. No secret in client bundles: anything needed client-side is
   `NEXT_PUBLIC_*` and public by design.
3. New env var ⇒ add it here in the same PR (the walker test enforces).
4. Rotations are logged in the ledger (`scripts/.116c/SHIPPABLE-LEDGER.md`).
