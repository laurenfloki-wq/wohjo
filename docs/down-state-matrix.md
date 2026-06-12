# FLOSTRUCTION Down-State Matrix

**B5 / SG-5 — Dispatch 2 (2026-06-12).** What happens when each external
dependency is down, what survives, how we find out, and how we recover.
Grounded in the code paths as reviewed during Dispatch 2 Workstream B
(PRs #111 stripe retry correctness, #112 export error contract,
#113 outbound dead letters). Companion to `docs/incident-runbook.md`.

Legend — **Durable record**: what is written that survives the outage.
**Detection**: how the outage becomes visible without anyone watching logs.
**Recovery**: what happens when the dependency returns.

---

## 1. Supabase (Postgres + Auth) — the substrate itself

The hard dependency. Nothing meaningful works without it; the design
goal is that nothing is *silently lost* while it is down.

| Surface | Behaviour while down | Durable record | Recovery |
|---|---|---|---|
| Worker/Supervisor/Command UI | Requests 5xx; auth fails closed | — (client retries) | Immediate on restore |
| Stripe webhook | event-log INSERT fails → non-dup error → **500** | Stripe keeps the event; retries up to 72h | Retry lands; insert-first idempotency applies (#111) |
| Twilio inbound SMS | idempotency INSERT fails → **500** | Twilio retries; payload re-presented | W4 reprocess-on-unfinished semantics |
| Outbound SMS/email | sends may still fire (provider up) but lookups fail first → no send; dead-letter recording ALSO fails (logged, never throws) | ERROR logs only — this is the one true silent window | Manual: check provider logs for the outage window |
| Cron checks | substrate-health/verify-hashes 500 | Vercel cron failure logs | `cron_health` check goes RED on next successful run if chain alarm went stale |

**Detection:** UptimeRobot monitors + Vercel error spike; every cron RED.
**Note:** a Supabase outage is the only state where outbound failures are
not dead-lettered (the dead-letter table lives in Supabase). Accepted —
the substrate is down; payroll actions are blocked anyway.

## 2. Stripe (API + webhooks)

| Surface | Behaviour while down | Durable record | Recovery |
|---|---|---|---|
| Checkout | Stripe-hosted page unavailable → signup blocked | — | Customer retries |
| Webhook delivery | No events arrive | Stripe queues + retries (≤72h) | Insert-first + processed_at-aware replay (#111): late events process exactly once; stale unprocessed rows re-dispatch |
| Handler fails mid-event (our side) | 500 → Stripe retries → **re-dispatch** path (#111); founding spot is event-keyed, cannot double-decrement | `stripe_event_log` row with `processed_at NULL` | Retry self-heals; if retries exhaust → `webhook_delivery_stripe` RED |

**Detection:** `webhook_delivery_stripe` health check (unprocessed >1h → RED → Slack).

## 3. Twilio

| Surface | Behaviour while down | Durable record | Recovery |
|---|---|---|---|
| Outbound worker SMS (approval/dispute) | Helper throws; callers fire-and-forget — approval/dispute WLES event already committed, never rolled back | `notification_dead_letter` row (#113) | Operator replay from context; `notification_outbound` RED until replayed |
| Supervisor batch SMS (cron) | Send fails | dead letter (#113) + cron logs | Same |
| Inbound YES/dispute replies | Workers' carriers hold/fail; Twilio webhook silent | Twilio-side queue (limited) | W4 idempotency: late deliveries reprocess if unfinished |
| Worker OTP sign-in | Challenge SMS fails → worker cannot sign in (phone OTP only, by design) | dead letter via MFA email path where applicable | Worker retries after restore |

**Detection:** `notification_outbound` RED; `webhook_delivery_twilio` RED for inbound stuck.

## 4. Resend (email)

| Surface | Behaviour while down | Durable record | Recovery |
|---|---|---|---|
| Welcome email | Webhook handler catches; provisioning unaffected | dead letter (#113) — incl. the previously-invisible returned-`{error}` mode | Operator resend |
| Payroll approval/dispute notifications | Recorded + swallowed (pre-B4 control flow preserved) | dead letter | Operator resend |
| Chain-integrity alert email | Recorded; cron continues | dead letter + `admin_access_log` alert rows + health log RED (email is tertiary) | Alert was never the durable record |
| Worker MFA code email | Send fails (code NOT stored in dead letter) | dead letter (kind only) | Worker re-requests a code |

**Detection:** `notification_outbound` RED.

## 5. Vercel (hosting + cron)

| Surface | Behaviour while down | Durable record | Recovery |
|---|---|---|---|
| Everything HTTP | Down | Stripe/Twilio queue their webhooks (≤72h / provider-limited) | Webhook replays drain on restore (idempotent, #111/W4) |
| Cron schedules | Don't fire | — | `cron_health` RED on next run if >26h gap; UptimeRobot catches the outage itself |

## 6. Slack ops webhook (`SLACK_ERROR_WEBHOOK_URL`)

Best-effort ping only (`void postOpsAlert`). Durable records (health log
rows, `admin_access_log` alert rows, dead letters) are all written FIRST.
A Slack outage loses the ping, never the record. Detection: none needed.

---

## Invariants this matrix relies on

1. Webhook idempotency is **insert-first with processed-tracking** on
   both Stripe (#111) and Twilio (W4): replays of unfinished work
   reprocess; replays of finished work no-op.
2. Outbound failures always leave a **dead letter** unless Supabase
   itself is down (§1 note).
3. Money/substrate state changes are never rolled back by notification
   failures (fire-and-forget by design).
4. Every RED lands in `substrate_health_log` + `admin_access_log`
   before any human ping is attempted.

## Parking lot

- Automated dead-letter retry/backoff cron (B4 note).
- Outbound dead-letter fallback when Supabase is down (e.g. Vercel KV)
  — currently the accepted silent window.
- Stripe retry exhaustion (>72h outage) → manual replay from the Stripe
  dashboard; document the exact click-path in the incident runbook.
