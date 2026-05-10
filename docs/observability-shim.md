# Observability shim — pre-Mo Slack error notifier

**Branch:** `observability-shim-vercel-slack-2026-05-10`
**Status:** shipped pre-Mo, retired when Datadog AU goes GA

## Why this exists

VOGELS-TALEB raised at Council 9 May that if a 500 occurs at 03:00 on Mo's first
night live, Lauren only finds out via SMS from Mo at 09:00. That is the most
fragile possible operational state.

Sentry was correctly cancelled per CRACK 172/179 — Sentry has no Australian
region and Privacy Act / APP 8 forbids routing PII through EU/US infrastructure.

This shim is the minimum viable replacement: an in-process error capture hook
that POSTs a PII-scrubbed alert to a Slack incoming webhook. We control the
data path end-to-end. No third-party SaaS, no EU/US storage, no PII leaving
Vercel.

## What this shim captures

For every error thrown inside an `/api/*` route handler:

- timestamp — ISO-8601 plus an AEST human-readable rendering
- route path (e.g. `/api/worker/shifts/start`)
- HTTP status code (defaulted to 500; Next does not surface the actual status
  in `onRequestError`)
- error message + the top frame of the stack, both PII-redacted and truncated
  at ~500 chars
- `x-vercel-id` request correlator (or `x-request-id` if present)
- `VERCEL_URL` (deployment hostname) and `VERCEL_ENV` (production / preview /
  development)

## What this shim does NOT capture

Hard rule — none of this ever leaves the function:

- phone numbers — `\+?\d{10,15}` redacted to `[PHONE]`
- email addresses — `[\w.+-]+@[\w-]+\.[\w.-]+` redacted to `[EMAIL]`
- UUIDs (worker IDs, shift IDs, tenant IDs) — redacted to `[UUID]`
- request bodies (Next does not give them to `onRequestError`; if it did we
  would refuse them)
- GPS coordinates, auth tokens, cookies, session identifiers
- any header content other than the bare `x-vercel-id` correlator

## Architecture

```
/api/* route throws
        │
        ▼
Next.js server captures error
        │
        ▼
instrumentation.ts → onRequestError(err, request, context)
        │
        ▼
src/lib/observability/slack.ts → reportError(ctx)
        ├── isApiRoute(path) — drop /_next, /favicon.ico, page renders
        ├── defaultThrottle.shouldFire(route, status) — drop after 10/min
        ├── safeMessage = redact(message) → truncate(500)
        ├── buildPayload — Slack Block Kit
        └── fetch(SLACK_ERROR_WEBHOOK_URL, AbortSignal.timeout(3s))
                │
                ▼
             Slack channel
```

Files:

- `instrumentation.ts` (project root) — Next 16 framework hook
- `src/lib/observability/redact.ts` — pure PII scrubber + truncator
- `src/lib/observability/throttle.ts` — in-memory rate limit (10 alerts per
  route+status per minute, per function instance)
- `src/lib/observability/slack.ts` — payload builder + webhook poster
- `src/lib/observability/*.test.ts` — unit + integration tests

## Provisioning the Slack webhook

Lauren provisions this separately. Steps:

1. In the Slack workspace, create a channel — e.g. `#wohjo-prod-errors`.
2. Visit <https://api.slack.com/messaging/webhooks> and follow the standard
   Slack flow — "Create New App" → "From scratch" → enable "Incoming Webhooks"
   → "Add New Webhook to Workspace" → choose the channel.
3. Slack returns a URL of the form
   `https://hooks.slack.com/services/T0.../B0.../...` — keep this secret.

## Setting `SLACK_ERROR_WEBHOOK_URL` in Vercel

```
Vercel project → Settings → Environment Variables
    Name:    SLACK_ERROR_WEBHOOK_URL
    Value:   <Slack webhook URL>
    Targets: Production (and Preview if you want preview alerts)
```

Trigger a redeploy after adding the var so Vercel rebuilds with the new env.

If the env var is missing the shim **silently no-ops** — production stays up,
nothing breaks, just no Slack alerts. A single `[observability-shim]
SLACK_ERROR_WEBHOOK_URL not set — shim disabled (no-op)` log line is emitted
once per function cold-start so you can confirm the shim noticed.

## Testing the shim end-to-end

After setting the env var:

1. Deploy a route that deliberately throws 500 on a query-string flag (e.g.
   `if (req.nextUrl.searchParams.has('observability_test')) throw new Error('shim test');`).
2. Hit `https://<deployment>/api/<that route>?observability_test=1`.
3. Slack message should land in `#wohjo-prod-errors` within ~3 seconds.
4. Verify: route path, status 500, AEST timestamp, `x-vercel-id`, redacted
   message.

Remove the test trigger before merging anything to main.

## Failure modes

| Scenario | Behaviour |
| --- | --- |
| `SLACK_ERROR_WEBHOOK_URL` unset | One-shot console log, then silent no-op |
| Slack webhook returns 4xx/5xx | `console.error` line, no retry, request unaffected |
| Slack network timeout (>3s) | `AbortController` cancels fetch, `console.error`, request unaffected |
| Route path is `/_next/...` etc. | `isApiRoute` rejects, no fetch attempted |
| Same route + status fires 50 times in a minute | First 10 alerts go through, the rest are dropped (per function instance) |

## Future-state: Datadog AU

When Datadog AU is GA and Lauren has data-residency sign-off, we replace this
shim with Datadog APM and retire `instrumentation.ts` + `src/lib/observability`.
The integration surface is small and replaceable — that is the design intent.
