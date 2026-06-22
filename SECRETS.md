# SECRETS — FLOSMOSIS Bot Fleet

Required environment variables / credentials, discovered as the fleet is built.
Each bot uses its own scoped credential where the provider supports it; never a director's
personal token. Secrets live in the platform secret store (Supabase function secrets, Vercel
env, GitHub Actions secrets), never in code or logs.

Status legend: `placeholder` = wired to an env var, code complete, value not yet provided.

## Fleet runtime (entrypoints)

| Env var            | Used by                    | Status      | Notes                                                                                                      |
| ------------------ | -------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| `CRON_SECRET`      | fleet run/worker routes    | placeholder | Bearer token Vercel Cron + pg_cron send to scheduled endpoints. Reuses the product's existing CRON_SECRET. |
| `FLEET_RUN_SECRET` | manual run + approvals API | placeholder | `x-fleet-secret` header for on-demand bot invokes and approval resolution.                                 |

After deploy, register the pg_cron schedules once:
`select fleet_register_cron('https://<app-domain>', '<CRON_SECRET>');`

## Core platform

| Env var                          | Used by                | Status      | Notes                                                        |
| -------------------------------- | ---------------------- | ----------- | ------------------------------------------------------------ |
| `DATABASE_URL`                   | `platform/db.ts`       | placeholder | Supabase Postgres connection string (pooled).                |
| `SUPABASE_URL`                   | connectors, obs        | placeholder | Project URL.                                                 |
| `SUPABASE_SERVICE_ROLE_KEY`      | platform (server-only) | placeholder | Never exposed to client.                                     |
| `ANTHROPIC_API_KEY`              | `platform/llm.ts`      | placeholder | Claude API key for the fleet.                                |
| `FLOSMOSIS_ABN`                  | `platform/guard.ts`    | placeholder | ABN string asserted in every outbound email (Spam Act 2003). |
| `FLOSMOSIS_UNSUBSCRIBE_BASE_URL` | `platform/guard.ts`    | placeholder | Base URL for the functional unsubscribe link.                |

## Notifications (approval router, bot 57)

| Env var                 | Used by           | Status      | Notes                                            |
| ----------------------- | ----------------- | ----------- | ------------------------------------------------ |
| `RESEND_API_KEY`        | hitl email notify | placeholder | Reuses product's Resend account or a scoped key. |
| `APPROVAL_NOTIFY_EMAIL` | hitl email notify | placeholder | Director notification inbox.                     |
| `TWILIO_ACCOUNT_SID`    | hitl SMS notify   | placeholder | Scoped subaccount preferred.                     |
| `TWILIO_AUTH_TOKEN`     | hitl SMS notify   | placeholder |                                                  |
| `TWILIO_FROM_NUMBER`    | hitl SMS notify   | placeholder |                                                  |
| `APPROVAL_NOTIFY_SMS`   | hitl SMS notify   | placeholder | Director mobile (E.164).                         |
| `APPROVAL_UI_BASE_URL`  | hitl              | placeholder | Base URL of the Vercel approval page.            |

## Connectors (added as each bot is built)

| Env var                                 | Used by                   | Status      | Notes                                            |
| --------------------------------------- | ------------------------- | ----------- | ------------------------------------------------ |
| `STRIPE_SECRET_KEY`                     | connectors/stripe         | placeholder | Bookkeeping, invoicing, dunning, reconciliation. |
| `STRIPE_WEBHOOK_SECRET`                 | functions/stripe-webhook  | placeholder | Signature verification.                          |
| `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` | connectors/xero           | placeholder | OAuth; tokens refreshed via shared helper.       |
| `HUBSPOT_PRIVATE_APP_TOKEN`             | connectors/hubspot        | placeholder | Scoped private app token.                        |
| `HUBSPOT_WEBHOOK_SECRET`                | functions/hubspot-webhook | placeholder | Signature verification.                          |
| `GITHUB_FLEET_TOKEN`                    | connectors/github         | placeholder | Scoped PAT for engineering bots.                 |
| `SENTRY_DSN`                            | obs                       | placeholder | Error signal.                                    |
