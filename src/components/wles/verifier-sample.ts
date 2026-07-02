// Demo chain for the in-browser WLES verifier. Two sealed events
// (CLOCK_IN → APPROVAL). Hashes were computed with the WLES v1.0
// algorithm; src/lib/wles/verifier-parity.test.ts re-verifies this
// sample against the production sealing code on every CI run, so it
// can never drift from the standard.
import type { WlesEvent } from '@/lib/wles/v1-types';

export const SAMPLE_CHAIN: WlesEvent[] = [
  {
    "actor_id": "worker-demo-001",
    "event_id": "11111111-1111-4111-8111-111111111111",
    "event_type": "CLOCK_IN",
    "payload": {
      "site_id": "site-demo-001",
      "clock_in_at": "2026-07-01T06:58:00+10:00",
      "method": "GEOFENCE_CONFIRMED"
    },
    "previous_event_hash": "0000000000000000000000000000000000000000000000000000000000000000",
    "subject_id": "shift-demo-001",
    "timestamp": "2026-07-01T06:58:02+10:00",
    "event_hash": "56699680c3bbb7fb113b020507e00971f6a889f8e2e024776fc375ffbc7d337c"
  },
  {
    "actor_id": "supervisor-demo-001",
    "event_id": "22222222-2222-4222-8222-222222222222",
    "event_type": "APPROVAL",
    "payload": {
      "approved_hours": "8.50",
      "approval_channel": "SMS"
    },
    "previous_event_hash": "56699680c3bbb7fb113b020507e00971f6a889f8e2e024776fc375ffbc7d337c",
    "subject_id": "shift-demo-001",
    "timestamp": "2026-07-01T15:34:10+10:00",
    "event_hash": "96253d8b556c09c74ada521d0803471a825624685f21afc5ce97880641f0298d"
  }
];
