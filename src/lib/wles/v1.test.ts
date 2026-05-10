// WLES v1.0 conformance test vectors — TV-001 through TV-005.
//
// These tests are the single source of truth for conformance of
// the FLOSTRUCTION reference implementation against the WLES v1.0
// spec (FLOSMOSIS/standards/WLES-v1.0-Specification.md).
//
// Any implementation change that regresses any of these vectors
// is a conformance break — CI must fail.
//
// The hashes encoded below were computed once with `sha256sum` and
// Node's `crypto.createHash('sha256')`, both producing identical
// output. They match spec §5.2's worked example (TV-001) and are
// derived by applying the spec's canonicalisation rules to the
// event bodies below.

import { describe, it, expect } from 'vitest';
import { canonicaliseEvent, hashEvent, sealEvent, verifyEvent, verifyChain, ZERO_HASH } from './v1';
import type { WlesEvent } from './v1-types';
import type { Sha256Hex } from './v1-types';

// ──────────────────────────────────────────────────────────────────────
// Shared actors / entities for the test vectors
// ──────────────────────────────────────────────────────────────────────
const W = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'; // worker
const SUP = '5f6e7d8c-9b0a-1b2c-3d4e-5f6a7b8c9d0e'; // supervisor
const SITE = '7f8e9d6c-5b4a-3210-fedc-ba9876543210';
const SHIFT = '2c3d4e5f-6789-0abc-def1-234567890abc';
const SYS = 'ffffffff-0000-0000-0000-000000000000'; // FLOSMOSIS system actor

// ──────────────────────────────────────────────────────────────────────
// TV-001 — single CLOCK_IN (spec §5.2 worked example)
// ──────────────────────────────────────────────────────────────────────
describe('WLES v1.0 TV-001 — spec §5.2 worked example', () => {
  const tv001: WlesEvent = {
    event_id: '11111111-2222-3333-4444-555555555555',
    event_type: 'CLOCK_IN',
    previous_event_hash: ZERO_HASH,
    actor_id: W,
    subject_id: W,
    timestamp: '2026-04-20T06:03:14.521Z',
    payload: { shift_id: SHIFT, site_id: SITE },
    event_hash: 'd2b1f31b6a500d92767783a6641e8cdf1b039cbb06b052e9992589a5e9387805',
  };

  const EXPECTED_CANONICAL =
    '{"actor_id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","event_id":"11111111-2222-3333-4444-555555555555","event_type":"CLOCK_IN","payload":{"shift_id":"2c3d4e5f-6789-0abc-def1-234567890abc","site_id":"7f8e9d6c-5b4a-3210-fedc-ba9876543210"},"previous_event_hash":"0000000000000000000000000000000000000000000000000000000000000000","subject_id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","timestamp":"2026-04-20T06:03:14.521Z"}';

  it('produces the canonical serialisation shown in spec §5.2', () => {
    const { event_hash, ...unsealed } = tv001;
    expect(canonicaliseEvent(unsealed)).toBe(EXPECTED_CANONICAL);
  });

  it('produces event_hash d2b1f31b…7805', () => {
    const { event_hash, ...unsealed } = tv001;
    expect(hashEvent(unsealed)).toBe(tv001.event_hash);
  });

  it('passes §8.1 single-event verification', () => {
    const result = verifyEvent(tv001);
    expect(result.ok).toBe(true);
  });

  it('passes §8.2 chain verification as a single-event chain', () => {
    const result = verifyChain([tv001]);
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────
// TV-002 — CLOCK_IN → CLOCK_OUT
// ──────────────────────────────────────────────────────────────────────
describe('WLES v1.0 TV-002 — two-event chain (CLOCK_IN → CLOCK_OUT)', () => {
  const ev1: WlesEvent = {
    event_id: '11111111-2222-3333-4444-555555555555',
    event_type: 'CLOCK_IN',
    previous_event_hash: ZERO_HASH,
    actor_id: W,
    subject_id: W,
    timestamp: '2026-04-20T06:03:14.521Z',
    payload: { shift_id: SHIFT, site_id: SITE },
    event_hash: 'd2b1f31b6a500d92767783a6641e8cdf1b039cbb06b052e9992589a5e9387805',
  };
  const ev2: WlesEvent = {
    event_id: '22222222-2222-3333-4444-555555555555',
    event_type: 'CLOCK_OUT',
    previous_event_hash: ev1.event_hash,
    actor_id: W,
    subject_id: W,
    timestamp: '2026-04-20T14:47:02.108Z',
    payload: {
      shift_id: SHIFT,
      site_id: SITE,
      worker_confirmed_start_at: '2026-04-20T06:03:14.521Z',
      start_time_source: 'worker_confirmed',
    },
    event_hash: '0146f59aa041661d2baaee08901ee367cf875860066ab9939d76a34572c1a4cb',
  };

  it('each event verifies individually', () => {
    expect(verifyEvent(ev1).ok).toBe(true);
    expect(verifyEvent(ev2).ok).toBe(true);
  });

  it('chain verifies end-to-end', () => {
    const result = verifyChain([ev1, ev2]);
    expect(result.ok).toBe(true);
    expect(result.events_scanned).toBe(2);
  });
});

// ──────────────────────────────────────────────────────────────────────
// TV-003 — full shift chain (7 committed event types)
// ──────────────────────────────────────────────────────────────────────
describe('WLES v1.0 TV-003 — full shift, 7 committed event types', () => {
  const chain: WlesEvent[] = [
    {
      event_id: '33333330-0000-0000-0000-000000000001',
      event_type: 'SHIFT_COMMIT',
      previous_event_hash: ZERO_HASH,
      actor_id: SUP,
      subject_id: W,
      timestamp: '2026-04-19T17:00:00.000Z',
      payload: {
        shift_id: SHIFT,
        site_id: SITE,
        scheduled_start: '2026-04-20T06:00:00.000Z',
        scheduled_end: '2026-04-20T14:00:00.000Z',
      },
      event_hash: '1b8f85ada0db2c0ec03cb66e4afed55079afebbfadf38a4e2ad131248e282fba',
    },
    {
      event_id: '33333330-0000-0000-0000-000000000002',
      event_type: 'CLOCK_IN',
      previous_event_hash: '1b8f85ada0db2c0ec03cb66e4afed55079afebbfadf38a4e2ad131248e282fba',
      actor_id: W,
      subject_id: W,
      timestamp: '2026-04-20T06:03:14.521Z',
      payload: {
        shift_id: SHIFT,
        site_id: SITE,
        detection_method: 'geofence',
        geofence_detected_at: '2026-04-20T06:03:14.521Z',
      },
      event_hash: '26b2b4df68998a88272d85bdbd1f9451baec6c9956e0056f8fba3aaa1a21fb24',
    },
    {
      event_id: '33333330-0000-0000-0000-000000000003',
      event_type: 'BREAK_START',
      previous_event_hash: '26b2b4df68998a88272d85bdbd1f9451baec6c9956e0056f8fba3aaa1a21fb24',
      actor_id: W,
      subject_id: W,
      timestamp: '2026-04-20T10:30:00.000Z',
      payload: { shift_id: SHIFT, break_type: 'meal' },
      event_hash: 'b2533e6090429d66ebbe20ff1477d2b5ed899e86f9c6055491523681bb239435',
    },
    {
      event_id: '33333330-0000-0000-0000-000000000004',
      event_type: 'BREAK_END',
      previous_event_hash: 'b2533e6090429d66ebbe20ff1477d2b5ed899e86f9c6055491523681bb239435',
      actor_id: W,
      subject_id: W,
      timestamp: '2026-04-20T11:00:00.000Z',
      payload: {
        shift_id: SHIFT,
        break_start_event_id: '33333330-0000-0000-0000-000000000003',
      },
      event_hash: '4eb69c24f1740f10a67d173118f8827817c90c845bede5b3661244de8c7389fe',
    },
    {
      event_id: '33333330-0000-0000-0000-000000000005',
      event_type: 'CLOCK_OUT',
      previous_event_hash: '4eb69c24f1740f10a67d173118f8827817c90c845bede5b3661244de8c7389fe',
      actor_id: W,
      subject_id: W,
      timestamp: '2026-04-20T14:47:02.108Z',
      payload: {
        shift_id: SHIFT,
        site_id: SITE,
        worker_confirmed_start_at: '2026-04-20T06:03:14.521Z',
        start_time_source: 'worker_confirmed',
      },
      event_hash: '34634f8db336ce296c4febc693d7ad81c113a72de52150312a9606aad0decfc5',
    },
    {
      event_id: '33333330-0000-0000-0000-000000000006',
      event_type: 'APPROVAL',
      previous_event_hash: '34634f8db336ce296c4febc693d7ad81c113a72de52150312a9606aad0decfc5',
      actor_id: SUP,
      subject_id: W,
      timestamp: '2026-04-20T14:52:18.342Z',
      payload: { shift_id: SHIFT, approved_hours: 8.23, approval_method: 'sms' },
      event_hash: '8b5d343ecd88f915a76ab6af0b55a4ef2bfae97ffddb235efa7e22c1ed2d7f9e',
    },
    {
      event_id: '33333330-0000-0000-0000-000000000007',
      event_type: 'INTELLIGENCE_CLEAR',
      previous_event_hash: '8b5d343ecd88f915a76ab6af0b55a4ef2bfae97ffddb235efa7e22c1ed2d7f9e',
      actor_id: SYS,
      subject_id: W,
      timestamp: '2026-04-20T14:52:19.000Z',
      payload: {
        shift_id: SHIFT,
        checks_performed: ['geofence_bounds', 'duration_sanity', 'supervisor_identity_match'],
        check_version: 'flostruction/1.0.0',
      },
      event_hash: '88abe9fe550b30c028c1770328fb866305d9e9f85df40baaf945d5e5cb0505b0',
    },
  ];

  it('each of the 7 events self-verifies', () => {
    for (let i = 0; i < chain.length; i++) {
      const r = verifyEvent(chain[i]);
      expect(r.ok, `event ${i} (${chain[i].event_type}) failed: ${r.message ?? r.reason}`).toBe(
        true,
      );
    }
  });

  it('the 7-event chain verifies end-to-end', () => {
    const r = verifyChain(chain);
    expect(r.ok).toBe(true);
    expect(r.events_scanned).toBe(7);
    expect(r.failures).toEqual([]);
  });

  it('covers all 7 committed event types exercised by the shift flow', () => {
    const types = chain.map((e) => e.event_type).sort();
    expect(types).toEqual([
      'APPROVAL',
      'BREAK_END',
      'BREAK_START',
      'CLOCK_IN',
      'CLOCK_OUT',
      'INTELLIGENCE_CLEAR',
      'SHIFT_COMMIT',
    ]);
  });
});

// ──────────────────────────────────────────────────────────────────────
// TV-004 — extension event in chain
// ──────────────────────────────────────────────────────────────────────
describe('WLES v1.0 TV-004 — extension event (X-FLOSMOSIS-DISPUTE_RAISED)', () => {
  const ev1: WlesEvent = {
    event_id: '11111111-2222-3333-4444-555555555555',
    event_type: 'CLOCK_IN',
    previous_event_hash: ZERO_HASH,
    actor_id: W,
    subject_id: W,
    timestamp: '2026-04-20T06:03:14.521Z',
    payload: { shift_id: SHIFT, site_id: SITE },
    event_hash: 'd2b1f31b6a500d92767783a6641e8cdf1b039cbb06b052e9992589a5e9387805',
  };
  const ev2: WlesEvent = {
    event_id: '44444444-0000-0000-0000-000000000002',
    event_type: 'X-FLOSMOSIS-DISPUTE_RAISED',
    previous_event_hash: ev1.event_hash,
    actor_id: SUP,
    subject_id: W,
    timestamp: '2026-04-20T15:00:00.000Z',
    payload: {
      shift_id: SHIFT,
      reason: 'Worker was not on site at claimed start time',
      'x-internal-ticket': 'FLOS-DISPUTE-0001',
    },
    event_hash: 'bfeb0c433803c8aade6d318fc532bf7305eab7fab5655705f54296493a83f9f7',
  };

  it('extension event verifies individually', () => {
    expect(verifyEvent(ev2).ok).toBe(true);
  });

  it('chain verifies across committed + extension event types', () => {
    const r = verifyChain([ev1, ev2]);
    expect(r.ok).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────
// TV-005 — tampered event (verifier MUST detect)
// ──────────────────────────────────────────────────────────────────────
describe('WLES v1.0 TV-005 — tampered event MUST fail verification', () => {
  const tamperedEvent: WlesEvent = {
    event_id: '11111111-2222-3333-4444-555555555555',
    event_type: 'CLOCK_IN',
    previous_event_hash: ZERO_HASH,
    // actor_id changed POST-seal from W to 9999…9999
    actor_id: '99999999-9999-9999-9999-999999999999',
    subject_id: W,
    timestamp: '2026-04-20T06:03:14.521Z',
    payload: { shift_id: SHIFT, site_id: SITE },
    // original event_hash from when actor_id was still W
    event_hash: 'd2b1f31b6a500d92767783a6641e8cdf1b039cbb06b052e9992589a5e9387805',
  };

  it('single-event verification returns HASH_MISMATCH', () => {
    const r = verifyEvent(tamperedEvent);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('HASH_MISMATCH');
  });

  it('chain verification flags the tampered event', () => {
    const r = verifyChain([tamperedEvent]);
    expect(r.ok).toBe(false);
    expect(r.failures.length).toBeGreaterThan(0);
    expect(r.failures.some((f) => f.reason === 'HASH_MISMATCH')).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────
// TV-006 — malformed genesis hash (non-zero first previous_event_hash)
// ──────────────────────────────────────────────────────────────────────
describe('WLES v1.0 TV-006 — first event with non-zero previous_event_hash MUST fail', () => {
  // Build a properly self-consistent event (its own hash matches
  // its body) but with a previous_event_hash that is NOT the zero
  // hash. Single-event check passes; chain check fails on linkage.
  const bogusPrev = 'f'.repeat(64);
  const unsealed = {
    event_id: '66666666-0000-0000-0000-000000000001',
    event_type: 'CLOCK_IN',
    previous_event_hash: bogusPrev,
    actor_id: W,
    subject_id: W,
    timestamp: '2026-04-20T06:03:14.521Z',
    payload: { shift_id: SHIFT, site_id: SITE },
  };
  const event_hash = hashEvent(unsealed);
  const ev: WlesEvent = { ...unsealed, event_hash };

  it('single-event verification passes (hash is internally consistent)', () => {
    expect(verifyEvent(ev).ok).toBe(true);
  });

  it('chain verification fails with GENESIS_LINK_INVALID', () => {
    const r = verifyChain([ev]);
    expect(r.ok).toBe(false);
    expect(r.failures[0].reason).toBe('GENESIS_LINK_INVALID');
  });
});

// ──────────────────────────────────────────────────────────────────────
// TV-007 — broken chain linkage between otherwise-valid events
// ──────────────────────────────────────────────────────────────────────
describe('WLES v1.0 TV-007 — broken previous_event_hash linkage', () => {
  const ev1u = {
    event_id: '77777777-0000-0000-0000-000000000001',
    event_type: 'CLOCK_IN',
    previous_event_hash: ZERO_HASH,
    actor_id: W,
    subject_id: W,
    timestamp: '2026-04-20T06:03:14.521Z',
    payload: { shift_id: SHIFT, site_id: SITE },
  };
  const ev1_hash = hashEvent(ev1u);
  const ev1: WlesEvent = { ...ev1u, event_hash: ev1_hash };

  // ev2's previous_event_hash points at ev1's hash, but imagine
  // someone inserts a different event between them. The
  // linkage is broken.
  const ev2u = {
    event_id: '77777777-0000-0000-0000-000000000002',
    event_type: 'CLOCK_OUT',
    previous_event_hash: 'a'.repeat(64), // wrong prev!
    actor_id: W,
    subject_id: W,
    timestamp: '2026-04-20T14:47:02.108Z',
    payload: {
      shift_id: SHIFT,
      site_id: SITE,
      worker_confirmed_start_at: '2026-04-20T06:03:14.521Z',
      start_time_source: 'worker_confirmed',
    },
  };
  const ev2_hash = hashEvent(ev2u);
  const ev2: WlesEvent = { ...ev2u, event_hash: ev2_hash };

  it('each event self-verifies', () => {
    expect(verifyEvent(ev1).ok).toBe(true);
    expect(verifyEvent(ev2).ok).toBe(true);
  });

  it('chain verification reports PREVIOUS_LINK_BROKEN on the second event', () => {
    const r = verifyChain([ev1, ev2]);
    expect(r.ok).toBe(false);
    const brokenLink = r.failures.find((f) => f.reason === 'PREVIOUS_LINK_BROKEN');
    expect(brokenLink).toBeDefined();
    expect(brokenLink!.index).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────────
// sealEvent — convenience sealer
// ──────────────────────────────────────────────────────────────────────
describe('sealEvent', () => {
  it('produces a sealed event whose hash matches a direct hashEvent call', () => {
    const unsealed = {
      event_id: '88888888-0000-0000-0000-000000000001',
      event_type: 'CLOCK_IN',
      previous_event_hash: ZERO_HASH,
      actor_id: W,
      subject_id: W,
      timestamp: '2026-04-20T06:03:14.521Z',
      payload: { shift_id: SHIFT, site_id: SITE },
    };
    const sealed = sealEvent(unsealed);
    expect(sealed.event_hash).toBe(hashEvent(unsealed));
    expect(verifyEvent(sealed).ok).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────
// verifyEvent — edge cases (branches not hit by TV-001–TV-007)
// ──────────────────────────────────────────────────────────────────────
describe('verifyEvent — edge cases', () => {
  it('returns MISSING_REQUIRED_FIELD when event is null', () => {
    const r = verifyEvent(null as unknown as WlesEvent);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('MISSING_REQUIRED_FIELD');
  });

  it('returns MISSING_REQUIRED_FIELD when a required field is null', () => {
    const good = sealEvent({
      event_id: '88888888-0000-0000-0000-000000000002',
      event_type: 'CLOCK_IN',
      previous_event_hash: ZERO_HASH,
      actor_id: W,
      subject_id: W,
      timestamp: '2026-04-20T07:00:00.000Z',
      payload: { shift_id: SHIFT, site_id: SITE },
    });
    const r = verifyEvent({ ...good, actor_id: null as unknown as string });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('MISSING_REQUIRED_FIELD');
  });

  it('returns MALFORMED_HASH when event_hash is not 64-char lowercase hex', () => {
    const good = sealEvent({
      event_id: '88888888-0000-0000-0000-000000000003',
      event_type: 'CLOCK_IN',
      previous_event_hash: ZERO_HASH,
      actor_id: W,
      subject_id: W,
      timestamp: '2026-04-20T07:01:00.000Z',
      payload: { shift_id: SHIFT, site_id: SITE },
    });
    const r = verifyEvent({ ...good, event_hash: 'not-a-hash' as Sha256Hex });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('MALFORMED_HASH');
  });

  it('returns MALFORMED_PREVIOUS_HASH when previous_event_hash is not 64-char hex', () => {
    const unsealed = {
      event_id: '88888888-0000-0000-0000-000000000004',
      event_type: 'CLOCK_IN',
      previous_event_hash: 'short' as Sha256Hex,
      actor_id: W,
      subject_id: W,
      timestamp: '2026-04-20T07:02:00.000Z',
      payload: { shift_id: SHIFT, site_id: SITE },
    };
    const event_hash = hashEvent(unsealed);
    const r = verifyEvent({ ...unsealed, event_hash });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('MALFORMED_PREVIOUS_HASH');
  });

  it('returns INVALID_EVENT_TYPE when event_type is not a committed type or valid extension', () => {
    const unsealed = {
      event_id: '88888888-0000-0000-0000-000000000005',
      event_type: 'NOT_A_REAL_EVENT',
      previous_event_hash: ZERO_HASH,
      actor_id: W,
      subject_id: W,
      timestamp: '2026-04-20T07:03:00.000Z',
      payload: { shift_id: SHIFT },
    };
    const event_hash = hashEvent(unsealed);
    const r = verifyEvent({ ...unsealed, event_hash } as WlesEvent);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('INVALID_EVENT_TYPE');
  });
});

// ──────────────────────────────────────────────────────────────────────
// canonicaliseValue — unsupported type branch
// ──────────────────────────────────────────────────────────────────────
describe('canonicaliseValue — unsupported type', () => {
  it('throws for a Symbol payload value', () => {
    expect(() =>
      hashEvent({
        event_id: '88888888-0000-0000-0000-000000000006',
        event_type: 'CLOCK_IN',
        previous_event_hash: ZERO_HASH,
        actor_id: W,
        subject_id: W,
        timestamp: '2026-04-20T07:04:00.000Z',
        payload: { x: Symbol('test') } as unknown as Record<string, unknown>,
      }),
    ).toThrow(/unsupported value type/);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Canonical-serialisation round-trip invariants
// ──────────────────────────────────────────────────────────────────────
describe('canonicalisation invariants', () => {
  it('key insertion order does not affect the canonical form', () => {
    const a = {
      event_id: '11111111-2222-3333-4444-555555555555',
      event_type: 'CLOCK_IN',
      previous_event_hash: ZERO_HASH,
      actor_id: W,
      subject_id: W,
      timestamp: '2026-04-20T06:03:14.521Z',
      payload: { shift_id: SHIFT, site_id: SITE },
    };
    const b = {
      // same content, intentionally different key insertion order
      payload: { site_id: SITE, shift_id: SHIFT },
      timestamp: '2026-04-20T06:03:14.521Z',
      subject_id: W,
      actor_id: W,
      previous_event_hash: ZERO_HASH,
      event_type: 'CLOCK_IN',
      event_id: '11111111-2222-3333-4444-555555555555',
    };
    expect(canonicaliseEvent(a)).toBe(canonicaliseEvent(b));
    expect(hashEvent(a)).toBe(hashEvent(b));
  });

  it('metadata field is included in hash when present', () => {
    const base = {
      event_id: '11111111-2222-3333-4444-555555555555',
      event_type: 'CLOCK_IN',
      previous_event_hash: ZERO_HASH,
      actor_id: W,
      subject_id: W,
      timestamp: '2026-04-20T06:03:14.521Z',
      payload: { shift_id: SHIFT, site_id: SITE },
    };
    const withMeta = { ...base, metadata: { app_version: 'flostruction/1.0.0' } };
    expect(hashEvent(base)).not.toBe(hashEvent(withMeta));
  });

  it('rejects non-finite numbers in payload', () => {
    expect(() =>
      hashEvent({
        event_id: '11111111-2222-3333-4444-555555555555',
        event_type: 'APPROVAL',
        previous_event_hash: ZERO_HASH,
        actor_id: SUP,
        subject_id: W,
        timestamp: '2026-04-20T06:03:14.521Z',
        payload: { shift_id: SHIFT, approved_hours: NaN, approval_method: 'sms' },
      }),
    ).toThrow(/non-finite/);
  });
});
