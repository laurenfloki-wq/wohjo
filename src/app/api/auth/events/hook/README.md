# Auth Events Hook — /api/auth/events/hook

## Contract

Supabase calls this endpoint as a **Custom Access Token Hook** (JWT Claims Hook) on every auth event (sign-in, sign-up, sign-out, token refresh, etc.).

The hook is wired in the Supabase Dashboard under **Authentication → Hooks → Custom Access Token**.

### Request format (Standard Webhooks)

Supabase delivers via [Standard Webhooks](https://www.standardwebhooks.com/):

| Header | Purpose |
|---|---|
| `svix-id` | Unique delivery ID. Use for cross-referencing with Supabase delivery logs. |
| `svix-timestamp` | Unix timestamp (seconds) of the delivery attempt. |
| `svix-signature` | HMAC-SHA256 of `<svix-id>.<svix-timestamp>.<raw-body>`, base64-encoded, prefixed `v1,`. May contain multiple space-separated values during secret rotation. |

Payload shape (Custom Access Token Hook):

```json
{
  "id": "<supabase-event-uuid>",
  "event": "SIGNED_IN",
  "occurred_at": "2026-05-09T10:00:00Z",
  "user": {
    "id": "<auth.users uuid>",
    "email": "user@example.com",
    ...
  },
  "claims": {
    "sub": "<auth.users uuid>",
    "email": "user@example.com",
    ...
  }
}
```

### Response format

The hook must return HTTP 200. Any non-200 response causes Supabase to abort the auth event — the user cannot sign in.

Success response (JWT Claims passthrough — existing claims returned unchanged):

```json
{ "claims": { ...claims from request body... } }
```

On any failure (signature invalid, insert failed, etc.) the hook still returns 200 with empty claims `{}`. This ensures auth is never blocked by the audit layer.

---

## Failure modes

| Outcome | Trigger | Behaviour |
|---|---|---|
| `signature_failure` | Missing or invalid `svix-signature` | Log WARN, return 200 `{claims:{}}` |
| `stale_timestamp` | `svix-timestamp` more than 5 minutes from now | Log WARN, return 200 `{claims:{}}` — replay protection |
| `body_read_failure` | Request body stream error | Log ERROR, return 200 `{claims:{}}` |
| `body_parse_failure` | Body is not valid JSON | Log WARN, return 200 `{claims:{}}` |
| `company_lookup_failed` | DB error during admins/workers lookup | Log WARN, continue with `company_id = null` |
| `duplicate_delivery` | `supabase_event_id` already in `auth_events` (PG 23505) | Log INFO, return 200 `{claims:{}}` — at-least-once dedup |
| `insert_failure` | Any other DB error on insert | Log ERROR, return 200 with claims passthrough |
| `ok` | Normal path | Log INFO, return 200 with claims passthrough |

---

## Observability

Every request exit emits a structured log line on `auth.hook.exit` with:

```json
{
  "route": "POST /api/auth/events/hook",
  "requestId": "<x-request-id>",
  "svixId": "<svix-id header>",
  "outcome": "ok | signature_failure | stale_timestamp | ...",
  "errorType": "SIGNATURE_FAILURE | INSERT_FAILURE | ...",
  "duration_ms": 12
}
```

`errorType` is only present on non-ok outcomes. Use it in Vercel Logs to query error rates:

```
# Vercel Logs filter examples
level:warn errorType:SIGNATURE_FAILURE
level:error errorType:INSERT_FAILURE
msg:auth.hook.exit outcome:ok
```

The `duration_ms` field on every exit log can be used to compute approximate latency percentiles via Vercel Logs aggregation or any downstream log sink.

Every hook invocation also emits `auth.hook.received` at entry with `svixId` and `svixTimestamp`, enabling delivery-level correlation with the Supabase Auth Hooks delivery log (Dashboard → Authentication → Hooks → Recent deliveries).

---

## Replay protection

The hook rejects deliveries whose `svix-timestamp` is more than **5 minutes** from the current server time (both future and past). This matches the Standard Webhooks recommendation and prevents captured requests from being replayed.

Duplicate at-least-once deliveries (same `supabase_event_id`) are handled by the database UNIQUE constraint on `auth_events.supabase_event_id`. Supabase may retry failed deliveries with the same payload; duplicate inserts silently return 200.

---

## Secret rotation

The shared secret lives in Vercel environment variable `SUPABASE_HOOK_SECRET`.

Format: `v1,whsec_<base64-encoded-secret>`

Steps to rotate:

1. In Supabase Dashboard → Authentication → Hooks, generate a new secret. Copy the full `v1,whsec_...` string.
2. In Vercel Dashboard → Project → Settings → Environment Variables, update `SUPABASE_HOOK_SECRET` with the new value.
3. Trigger a Vercel redeploy (or wait for next deploy).
4. During the rotation window, Supabase may send requests with either the old or new secret. Standard Webhooks supports multiple signatures in the `svix-signature` header (`v1,<sig1> v1,<sig2>`); the handler accepts any matching signature so zero deliveries are dropped during rotation.
5. Once the new secret is confirmed active in Supabase, remove the old `SUPABASE_HOOK_SECRET` value from Vercel.
