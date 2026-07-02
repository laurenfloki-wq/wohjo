# Offline capture — dual-time semantics (Option 1)

**Decision:** Option 1 — dual-time, labelled honestly. Approved by Lauren
de Mestre, 2026-07-02, from three options (dual-time / seal-time-only /
no queueing).

## Semantics

A shift event queued offline carries two times, each labelled for what
it is:

| Field | Witness | Meaning |
| --- | --- | --- |
| `captured_at` | device (asserted) | when the worker performed the action |
| `sealed_at` | server (verified) | when the record was received and sealed |

At sync the client also sends `client_now`; the server measures
`clock_skew_seconds = client_now − server_now` and records
`captured_at_skew_adjusted` (the capture assertion translated onto the
server clock) plus `capture_to_seal_seconds`. A gap beyond
**12 hours** (`OFFLINE_CAPTURE_MAX_GAP_SECONDS`) sets
`capture_gap_exceeded: true` and emits a structured `log.warn` for the
intelligence layer.

Unchanged evidentiary anchors:

- `CLOCK_IN.timestamp` remains **server-witnessed** (meter time).
- `CLOCK_OUT` continues to use the **classifier-bounded worker-asserted
  end time** (behaviour since the Day 6 redesign); a queued clock-out
  sends `end_time = captured_at`, so the existing duration bounds apply
  to the asserted time exactly as they always have.
- Sealing happens only on the server. The queue stores intent, not seals.

## Conformance

The block is embedded as `x-flos-offline-capture` in event `metadata`
(and mirrored in `event_data.offline_capture` for compat), using the
WLES v1.0 **§9.2 extension mechanism** — records remain fully conformant
with the published standard, and independent verifiers see
self-describing fields. Promoting `captured_at` to a core optional field
is a candidate for **spec v1.1** (Foundation Entity decision).

## Replay safety

Replays reuse the existing `client_event_id` idempotency substrate
(partial unique indexes `uq_shift_events_client_event_id` /
`uq_shift_events_end_idempotent`): a queued record replayed N times
seals exactly once. Queue removal policy on replay: 2xx/409 remove;
non-401 4xx remove-and-warn; 401/5xx/network keep.

## Surfaces

- `src/lib/field/offline-capture.ts` — server assessment (+ tests)
- `src/lib/field/offline-queue.ts` — IndexedDB queue + replay
- `src/app/api/field/shift/{start,end}/route.ts` — `offline` input
- `src/components/field/FieldServiceWorker.tsx` — replay lifecycle + banner
- `public/field-sw.js` — Background Sync wake-up (progressive enhancement)
