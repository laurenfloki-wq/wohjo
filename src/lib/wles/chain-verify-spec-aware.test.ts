// SG-4 Workstream A — spec-aware chain verifier tests.
//
// Two layers:
//   1. PRODUCTION-PATTERN PINS — synthetic fixtures (demo canon only)
//      replicating the exact four structures found in production on
//      2026-06-12, sealed with the real writer methods. These pin the
//      acceptance paths: canonical, CRACK 72 annotation, pre-
//      canonicalisation insertion order, v1 canonical, v1 attested
//      legacy type name, v0 segment genesis.
//   2. TAMPER PROPERTY — for EVERY event in the clean fixture chain,
//      mutating any payload field, the stored hash, or a chain link
//      must flag EXACTLY that event. Mutating nothing must be GREEN.
//      This is the test that proves the signal: red only if the
//      mathematics says so.

import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { generateEventHash } from './hash';
import { sealEvent } from './v1';
import { ZERO_HASH, type WlesEvent } from './v1-types';
import {
  verifyCompanyChainSpecAware,
  verifyEventSelfHashSpecAware,
  type ShiftEventRowSpecAware,
} from './chain-verify-spec-aware';

// Demo canon ids only (Demo Labour Hire Pty Ltd).
const COMPANY = 'dddddddd-0000-4000-8000-000000000001';
const WORKER = 'dddddddd-0000-4000-8000-000000000004';
const SITE = 'dddddddd-0000-4000-8000-000000000002';
const ACTOR = 'dddddddd-0000-4000-8000-000000000009';

let n = 0;
const uid = () => `dddddddd-0000-4000-8000-${String(100 + ++n).padStart(12, '0')}`;

function sealV0(
  partial: Omit<
    ShiftEventRowSpecAware,
    'event_hash' | 'id' | 'company_id' | 'worker_id' | 'site_id'
  >,
): ShiftEventRowSpecAware {
  const ev = {
    id: uid(),
    company_id: COMPANY,
    worker_id: WORKER,
    site_id: SITE,
    ...partial,
  } as ShiftEventRowSpecAware;
  ev.event_hash = generateEventHash({
    company_id: ev.company_id ?? '',
    worker_id: ev.worker_id ?? '',
    site_id: ev.site_id ?? '',
    event_type: ev.event_type,
    event_data: ev.event_data,
    created_at: new Date(ev.created_at as string),
  });
  return ev;
}

/** Replicates the pre-2026-05-01 writer: plain JSON.stringify in insertion order. */
function sealV0PreCanonical(
  createdAt: string,
  dataInWriterOrder: Record<string, unknown>,
): ShiftEventRowSpecAware {
  const ev: ShiftEventRowSpecAware = {
    id: uid(),
    company_id: COMPANY,
    worker_id: WORKER,
    site_id: SITE,
    event_type: 'START_EVENT',
    event_data: dataInWriterOrder,
    event_hash: '',
    previous_event_hash: null,
    created_at: createdAt,
    spec_version: '0',
  };
  const input = [
    COMPANY,
    WORKER,
    SITE,
    'START_EVENT',
    JSON.stringify(dataInWriterOrder),
    new Date(createdAt).toISOString(),
  ].join('|');
  ev.event_hash = createHash('sha256').update(input, 'utf8').digest('hex');
  // Simulate the PG jsonb round-trip reordering keys (alphabetical here —
  // any order other than the writer's proves the path recomputes from the
  // documented order, not the stored order).
  ev.event_data = Object.fromEntries(
    Object.keys(dataInWriterOrder)
      .sort()
      .map((k) => [k, dataInWriterOrder[k]]),
  );
  return ev;
}

function sealV1Row(
  createdAt: string,
  eventType: string,
  payload: Record<string, unknown>,
  previousEventHash: string,
): ShiftEventRowSpecAware {
  const sealed: WlesEvent = sealEvent({
    event_id: uid(),
    event_type: eventType,
    payload,
    previous_event_hash: previousEventHash,
    actor_id: ACTOR,
    subject_id: WORKER,
    timestamp: createdAt,
  } as Omit<WlesEvent, 'event_hash'>);
  return {
    id: uid(),
    company_id: COMPANY,
    worker_id: WORKER,
    site_id: SITE,
    event_type: eventType,
    event_data: payload,
    event_hash: sealed.event_hash,
    previous_event_hash: sealed.previous_event_hash,
    created_at: createdAt,
    spec_version: '1.0',
    wles_event: sealed,
  };
}

/** Build the full production-pattern fixture chain (clean). */
function buildFixtureChain(): ShiftEventRowSpecAware[] {
  n = 0;
  const rows: ShiftEventRowSpecAware[] = [];

  // 1. Pre-canonicalisation START (the João pattern, demo canon data).
  const start1 = sealV0PreCanonical('2026-04-30T20:55:46.881Z', {
    start_time: '2026-04-30T20:55:46.881Z',
    shift_date: '2026-05-01',
    gps_lat: null,
    gps_lng: null,
    client_event_id: uid(),
  });
  rows.push(start1);

  // 2. Canonical END + SHIFT_COMMIT chained on.
  const end1 = sealV0({
    event_type: 'END_EVENT',
    event_data: {
      end_time: '2026-05-01T05:38:22.934Z',
      shift_id: uid(),
      total_hours: 8.21,
      break_minutes: 30,
    },
    previous_event_hash: start1.event_hash,
    created_at: '2026-05-01T05:38:22.934Z',
    spec_version: '0',
  });
  rows.push(end1);
  const commit1 = sealV0({
    event_type: 'SHIFT_COMMIT',
    event_data: {
      shift_id: uid(),
      receipt_id: 'FSTR-DEMO0001',
      total_hours: 8.21,
      committed_at: '2026-05-01T05:38:22.935Z',
      break_minutes: 30,
    },
    previous_event_hash: end1.event_hash,
    created_at: '2026-05-01T05:38:22.935Z',
    spec_version: '0',
  });
  rows.push(commit1);

  // 3. CRACK 72-annotated approval: sealed over ORIGINAL data, tag keys
  //    added afterwards (replicating the 2026-05-07 tagging pass).
  const approval1 = sealV0({
    event_type: 'SUPERVISOR_APPROVAL',
    event_data: {
      reply: 'SMS_APPROVAL',
      method: 'SMS',
      shift_id: uid(),
      receipt_id: 'FSTR-DEMO0001',
      approver_phone: '+61400000001',
    },
    previous_event_hash: commit1.event_hash,
    created_at: '2026-05-06T07:47:34.677Z',
    spec_version: '0',
  });
  approval1.event_data = {
    ...approval1.event_data,
    historical_duplicate: true,
    tagged_at: '2026-05-07',
    tagged_reason: 'CRACK 72 retry duplicates - Option B canonical = newest per shift_id',
  };
  rows.push(approval1);

  // 4. Untagged canonical approval.
  const approval2 = sealV0({
    event_type: 'SUPERVISOR_APPROVAL',
    event_data: {
      layer: 'FINAL',
      method: 'PAYROLL_ADMIN',
      shift_id: uid(),
      receipt_id: 'FSTR-DEMO0001',
    },
    previous_event_hash: approval1.event_hash,
    created_at: '2026-05-06T08:49:11.829Z',
    spec_version: '0',
  });
  rows.push(approval2);

  // 5. Segment genesis: a later START with previous NULL (v0 semantics).
  const start2 = sealV0({
    event_type: 'START_EVENT',
    event_data: {
      gps_lat: null,
      gps_lng: null,
      shift_date: '2026-05-08',
      start_time: '2026-05-08T00:25:00.435Z',
      client_event_id: uid(),
    },
    previous_event_hash: null,
    created_at: '2026-05-08T00:25:00.435Z',
    spec_version: '0',
  });
  rows.push(start2);
  const end2 = sealV0({
    event_type: 'END_EVENT',
    event_data: {
      end_time: '2026-05-08T05:43:28.735Z',
      shift_id: uid(),
      total_hours: 4.81,
      break_minutes: 30,
    },
    previous_event_hash: start2.event_hash,
    created_at: '2026-05-08T05:43:28.735Z',
    spec_version: '0',
  });
  rows.push(end2);

  // 6. v1 chain: migration marker (ZERO_HASH genesis) -> attested
  //    legacy-type-name EXPORT_RECORD (pre-fix) -> conformant X- event.
  const mig = sealV1Row(
    '2026-06-04T02:56:50.920Z',
    'X-FLOSMOSIS-SPEC_VERSION_MIGRATION',
    {
      from_spec_version: '0',
      to_spec_version: '1.0',
      from_chain_tail_hash: end2.event_hash,
      reason: 'demo fixture',
    },
    ZERO_HASH,
  );
  rows.push(mig);
  const legacyExport = sealV1Row(
    '2026-06-06T04:53:33.767Z',
    'EXPORT_RECORD', // pre-fix legacy name — hash still verifies
    { provider: 'myob', shift_id: uid(), export_id: 'a'.repeat(64), file_hash: 'b'.repeat(64) },
    (mig.wles_event as WlesEvent).event_hash,
  );
  rows.push(legacyExport);
  const conformantExport = sealV1Row(
    '2026-06-08T01:00:00.000Z',
    'X-FLOSMOSIS-EXPORT_RECORD',
    { provider: 'myob', shift_id: uid(), export_id: 'c'.repeat(64), file_hash: 'd'.repeat(64) },
    (legacyExport.wles_event as WlesEvent).event_hash,
  );
  rows.push(conformantExport);

  return rows;
}

describe('verifyCompanyChainSpecAware — production-pattern pins', () => {
  it('verifies a clean mixed-era chain with zero mismatches', () => {
    const rows = buildFixtureChain();
    const r = verifyCompanyChainSpecAware(rows);
    expect(r.mismatches).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.events_scanned).toBe(rows.length);
    expect(r.path_tally.V0_PRE_CANONICALISATION).toBe(1);
    expect(r.path_tally.V0_ANNOTATED_CRACK72).toBe(1);
    expect(r.path_tally.V1_TYPE_NAME_ANOMALY_PRE_FIX).toBe(1);
    expect(r.path_tally.V1_CANONICAL).toBe(2);
    expect(r.notes.some((x) => x.note === 'V0_SEGMENT_GENESIS')).toBe(true);
  });

  it('returns GREEN on an empty chain', () => {
    const r = verifyCompanyChainSpecAware([]);
    expect(r.ok).toBe(true);
    expect(r.events_scanned).toBe(0);
  });
});

describe('verifyCompanyChainSpecAware — tamper property (RED on mutation, exactly the mutated event)', () => {
  const clone = (o: unknown) => JSON.parse(JSON.stringify(o)) as ShiftEventRowSpecAware[];

  // The CRACK 72 annotation keys were added AFTER sealing, so they are
  // not covered by any hash — by definition they cannot be tamper-
  // evident. Every SEALED field must be. The annotation keys' own
  // integrity is covered separately below.
  const UNSEALED_ANNOTATION_KEYS = new Set(['historical_duplicate', 'tagged_at', 'tagged_reason']);

  it('flags exactly the mutated event for EVERY event and EVERY sealed field', () => {
    const rows = buildFixtureChain();
    for (let i = 0; i < rows.length; i++) {
      const base = rows[i].wles_event
        ? Object.keys((rows[i].wles_event as WlesEvent).payload as Record<string, unknown>)
        : Object.keys(rows[i].event_data).filter((k) => !UNSEALED_ANNOTATION_KEYS.has(k));
      for (const field of base) {
        const t = clone(rows);
        const ev = t[i];
        if (ev.wles_event) {
          const p = ev.wles_event.payload as Record<string, unknown>;
          p[field] =
            typeof p[field] === 'number' ? (p[field] as number) + 1 : String(p[field]) + 'X';
        } else {
          const d = ev.event_data as Record<string, unknown>;
          d[field] =
            typeof d[field] === 'number' ? (d[field] as number) + 1 : String(d[field]) + 'X';
        }
        const r = verifyCompanyChainSpecAware(t);
        const flagged = new Set(r.mismatches.map((m) => m.event_id));
        expect(r.ok, `event[${i}] field=${field} must go RED`).toBe(false);
        expect(flagged.has(ev.id), `event[${i}] field=${field} must flag the mutated event`).toBe(
          true,
        );
        expect(flagged.size, `event[${i}] field=${field} must flag ONLY the mutated event`).toBe(1);
      }
    }
  });

  it('documents that post-seal annotation keys are unsealed metadata: mutating them does not break the seal, but replacing the CRACK 72 marker disables the strip path and goes RED', () => {
    const rows = clone(buildFixtureChain());
    const annotated = rows[3]; // CRACK 72-annotated approval
    // Mutating tagged_at: the seal never covered it -> chain stays GREEN
    // (the original sealed content still verifies exactly).
    (annotated.event_data as Record<string, unknown>).tagged_at = '2026-05-09';
    let r = verifyCompanyChainSpecAware(rows);
    expect(r.ok).toBe(true);
    expect(r.path_tally.V0_ANNOTATED_CRACK72).toBe(1);
    // Replacing tagged_reason so it no longer carries the CRACK 72
    // marker: the strip path is no longer applicable -> RED.
    (annotated.event_data as Record<string, unknown>).tagged_reason = 'unrelated note';
    r = verifyCompanyChainSpecAware(rows);
    expect(
      r.mismatches.some((m) => m.event_id === annotated.id && m.reason === 'SELF_HASH_MISMATCH'),
    ).toBe(true);
  });

  it('flags a flipped stored event_hash (and the dependent link)', () => {
    const rows = clone(buildFixtureChain());
    rows[2].event_hash = 'f'.repeat(64);
    const r = verifyCompanyChainSpecAware(rows);
    expect(r.ok).toBe(false);
    expect(
      r.mismatches.some((m) => m.event_id === rows[2].id && m.reason === 'SELF_HASH_MISMATCH'),
    ).toBe(true);
  });

  it('flags a broken v0 chain link', () => {
    const rows = clone(buildFixtureChain());
    rows[1].previous_event_hash = 'e'.repeat(64);
    const r = verifyCompanyChainSpecAware(rows);
    expect(
      r.mismatches.some((m) => m.event_id === rows[1].id && m.reason === 'PREVIOUS_LINK_BROKEN'),
    ).toBe(true);
  });

  it('rejects the fake-CRACK72-tag smuggling attack', () => {
    const rows = clone(buildFixtureChain());
    const victim = rows[4]; // untagged canonical approval
    const d = victim.event_data as Record<string, unknown>;
    d.method = 'FORGED';
    d.historical_duplicate = true;
    d.tagged_at = '2026-05-07';
    d.tagged_reason = 'CRACK 72 forged annotation';
    const r = verifyCompanyChainSpecAware(rows);
    expect(r.mismatches.some((m) => m.event_id === victim.id)).toBe(true);
  });

  it('rejects a legacy v1 type name sealed AFTER the writer fix', () => {
    const rows = clone(buildFixtureChain());
    const victim = rows.find((x) => x.event_type === 'EXPORT_RECORD' && x.spec_version === '1.0')!;
    victim.created_at = '2026-06-09T00:00:00.000Z';
    const r = verifyCompanyChainSpecAware(rows);
    expect(
      r.mismatches.some((m) => m.event_id === victim.id && m.reason === 'V1_INVALID_EVENT_TYPE'),
    ).toBe(true);
  });

  it('rejects non-START v0 events with NULL previous hash', () => {
    const rows = clone(buildFixtureChain());
    rows[2].previous_event_hash = null; // SHIFT_COMMIT must not open a segment
    const r = verifyCompanyChainSpecAware(rows);
    expect(
      r.mismatches.some((m) => m.event_id === rows[2].id && m.reason === 'GENESIS_LINK_INVALID'),
    ).toBe(true);
  });

  it('rejects a tampered v1 genesis link', () => {
    const rows = clone(buildFixtureChain());
    const mig = rows.find((x) => x.event_type === 'X-FLOSMOSIS-SPEC_VERSION_MIGRATION')!;
    (mig.wles_event as WlesEvent).previous_event_hash = '1'.repeat(64);
    const r = verifyCompanyChainSpecAware(rows);
    expect(r.mismatches.some((m) => m.event_id === mig.id)).toBe(true);
  });
});

describe('verifyEventSelfHashSpecAware — single-event self-hash kernel', () => {
  const clone = (o: unknown) => JSON.parse(JSON.stringify(o)) as ShiftEventRowSpecAware;

  it('accepts a clean v0 canonical event and rejects a payload mutation', () => {
    const ev = sealV0({
      event_type: 'SUPERVISOR_APPROVAL',
      event_data: { method: 'SMS', shift_id: uid(), receipt_id: 'FSTR-DEMO0009' },
      previous_event_hash: null,
      created_at: '2026-05-10T07:47:34.677Z',
      spec_version: '0',
    });
    expect(verifyEventSelfHashSpecAware(ev)).toMatchObject({ ok: true, path: 'V0_CANONICAL' });

    const tampered = clone(ev);
    (tampered.event_data as Record<string, unknown>).method = 'FORGED';
    expect(verifyEventSelfHashSpecAware(tampered)).toMatchObject({
      ok: false,
      reason: 'SELF_HASH_MISMATCH',
    });
  });

  it('accepts a clean v1 conformant event and rejects a payload mutation', () => {
    const ev = sealV1Row(
      '2026-06-17T01:00:00.000Z',
      'X-FLOSMOSIS-EXPORT_RECORD',
      {
        provider: 'employment_hero',
        shift_id: uid(),
        export_id: 'a'.repeat(36),
        file_hash: 'b'.repeat(64),
      },
      ZERO_HASH,
    );
    expect(verifyEventSelfHashSpecAware(ev)).toMatchObject({ ok: true, path: 'V1_CANONICAL' });

    const tampered = clone(ev);
    (tampered.wles_event as WlesEvent).payload = {
      ...(tampered.wles_event as WlesEvent).payload,
      file_hash: 'c'.repeat(64),
    };
    expect(verifyEventSelfHashSpecAware(tampered).ok).toBe(false);
  });

  // The exact production shape that turned the audit pack RED: a v1.0
  // EXPORT_RECORD whose SUBSTRATE event_type column carries the bare
  // canonical name (m0d) while the WLES type lives in wles_event. The
  // authoritative hash is the v1 JCS hash — a v0 recompute over the bare
  // type + compat event_data necessarily mismatches.
  it('verifies a v1 EXPORT_RECORD even when the substrate event_type is the bare name', () => {
    const sealedRow = sealV1Row(
      '2026-06-17T01:31:37.000Z',
      'X-FLOSMOSIS-EXPORT_RECORD',
      {
        provider: 'employment_hero',
        shift_id: uid(),
        export_id: 'e'.repeat(36),
        file_hash: 'f'.repeat(64),
      },
      ZERO_HASH,
    );
    // Substrate column = bare 'EXPORT_RECORD'; compat event_data differs
    // in shape from the sealed payload — exactly as insertV1Event writes.
    const row: ShiftEventRowSpecAware = {
      ...sealedRow,
      event_type: 'EXPORT_RECORD',
      event_data: {
        shift_id: 'x',
        receipt_id: 'FSTR-DEMO0010',
        export_id: 'y',
        provider: 'employment_hero',
        file_hash: 'z',
      },
    };

    // v0 recompute (the old audit-pack path) would mismatch...
    const v0Recompute = generateEventHash({
      company_id: row.company_id ?? '',
      worker_id: row.worker_id ?? '',
      site_id: row.site_id ?? '',
      event_type: row.event_type,
      event_data: row.event_data,
      created_at: new Date(row.created_at as string),
    });
    expect(v0Recompute).not.toBe(row.event_hash);

    // ...but the spec-aware kernel verifies it via WLES v1.0 §8.1.
    expect(verifyEventSelfHashSpecAware(row)).toMatchObject({ ok: true, path: 'V1_CANONICAL' });
  });

  it('does not assume a v1 pass when spec_version is 1.0 but wles_event is missing', () => {
    const ev = sealV0({
      event_type: 'EXPORT_RECORD',
      event_data: { shift_id: uid() },
      previous_event_hash: null,
      created_at: '2026-06-17T02:00:00.000Z',
      spec_version: '0',
    });
    // Claim v1 with no sealed payload — the kernel cannot verify a v1
    // event without its wles_event, so it falls back to the v0 method
    // rather than silently passing. With a flipped stored hash, that
    // fallback correctly fails (no free pass for a malformed v1 row).
    const broken: ShiftEventRowSpecAware = {
      ...ev,
      event_hash: '0'.repeat(64),
      spec_version: '1.0',
      wles_event: null,
    };
    expect(verifyEventSelfHashSpecAware(broken)).toMatchObject({
      ok: false,
      reason: 'SELF_HASH_MISMATCH',
    });
  });
});
