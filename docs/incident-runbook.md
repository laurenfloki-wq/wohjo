# WOHJO incident runbook — FLOS-SHA-001 alarms

**Audience:** the platform operator (Lauren). One page; every RED that
can fire, what it means, what to do. Alert channel: the Slack webhook
(`SLACK_ERROR_WEBHOOK_URL`, see `docs/observability-shim.md`). Every
alert is PII-scrubbed; correlate with Vercel logs via the
`x-vercel-id` / `x-request-id` shown in the alert.

## Where the evidence lives

| Surface | What it holds |
|---|---|
| `substrate_health_log` | Every daily check outcome (GREEN/RED + detail + baseline). Read via Supabase SQL editor (service/postgres role). |
| `admin_access_log` | Durable alert rows (`CHAIN_BREAK:*`, `ANCHOR_MISMATCH:*`, `ANCHOR_UNVERIFIABLE:*`). |
| `webhook_idempotency` | Every Twilio delivery; unprocessed rows carry the FULL form payload (replayable). |
| `stripe_event_log` | Every Stripe event; unprocessed rows mean the handler kept failing. |
| Vercel logs | `log.error` lines with request ids; cron failures surface as function errors. |

## The alarms

### `anchor_fingerprint` RED — possible substrate tampering
The frozen anchor's recomputed fingerprint no longer matches the bound
value. **This is the serious one.**
1. Do NOT write to `shift_events` or `substrate_anchors`.
2. Re-run the recomputation read-only: `SELECT * FROM v_anchor_verification;`
3. Compare `actual_count` vs `expected_count` — a count drift means rows
   appeared/disappeared inside the frozen window; a fingerprint-only
   drift means a row was altered in place.
4. Check `admin_access_log` for the alert row timestamp; pull Supabase
   audit/PITR around that window.
5. Escalate to the verification spine (chat-Claude) with the
   `substrate_health_log` row id before any remediation.

### `anchor_fingerprint` ERROR — anchor without an inline formula
Not tampering: an anchor row exists that the verification view has no
CASE arm for (or zero anchors). A code change is owed in
`migrations/...m3_substrate_anchors...` style: add the inline formula
to the view AND keep `formula_text` documentation in sync.

### `chain_integrity_shift_events` RED — WLES chain break
`verify-hashes` found hash/linkage mismatches. Alert rows
(`CHAIN_BREAK:<reason>`) carry event ids; the email lists the lines.
1. Read the mismatch sample in the cron's JSON response (Vercel logs).
2. Per CLAUDE.md rule 6 nothing is ever deleted — a break means a row
   was altered or inserted out of band. Same escalation as anchors.

### `webhook_delivery_twilio` RED — a supervisor action is stuck
Unprocessed Twilio deliveries older than 1 hour. The row in
`webhook_idempotency` holds the full form payload.
1. `SELECT key, payload, first_seen_at FROM webhook_idempotency WHERE source='twilio' AND processed_at IS NULL;`
2. Find the processing error in Vercel logs (`webhook.twilio.processing_failed`, match the MessageSid).
3. Fix the cause; replay by POSTing the stored payload to the webhook
   (Twilio signature validation requires the original headers — for a
   manual replay use the payload to act through WOHJO Command instead:
   the supervisor's YES/NO codes are in `payload.Body`).
4. Mark the row processed once actioned:
   `UPDATE webhook_idempotency SET processed_at=now(), outcome='manual_replay' WHERE source='twilio' AND key='<sid>';`

### `webhook_delivery_stripe` RED — a billing event is stuck
Same shape: `stripe_event_log` rows with `processed_at IS NULL` older
than 1 hour. Stripe retries for days — usually this self-heals after a
fix is deployed; the Stripe dashboard can also re-send the event.

### `cron_health` RED — the alarm itself is not running
`verify-hashes` has not recorded an outcome in 26 hours.
1. Check Vercel → Crons: did `/api/cron/verify-hashes` run? Errors?
2. Check `CRON_SECRET` is set; a 401 in the logs means it isn't, or
   Vercel's cron auth changed.
3. Until fixed, the chain is unwatched — treat as a priority fix, not
   cosmetic.

### Route 500s (Slack, via the instrumentation shim)
Throttled at 10/min per route+status. The alert carries the route, a
redacted message + top stack frame, and the `x-vercel-id` — paste that
id into Vercel log search for the full trace.

## Synthetic test
The alarm pipeline is proven in CI on every PR:
`src/app/api/cron/substrate-health/route.test.ts` forces an anchor
mismatch and asserts alert row → RED record → Slack ping. To test the
live Slack leg, follow `docs/observability-shim.md` §Testing.

## Escalation
1. Verification spine (chat-Claude) — read-only review first.
2. `gate-reports/` + the relevant PR for context.
3. Rollback: every change ships as an independently revertible squash
   commit; `git revert <sha>` + redeploy. DDL rollbacks go through a
   new migration, never manual edits.
