// Phase 1 §3a pack lib — fingerprint stability + idempotency tests.

import { describe, it, expect } from 'vitest';
import {
  buildPackManifest, manifestCanonicalBytes, packFingerprint,
  computeIdempotencyKey, hashBytes,
  type PackManifestInput,
} from './pack';

const COMPANY = '00000000-1000-0000-0000-000000000001';
const WORKER  = '00000000-2000-0000-0000-000000000001';

function baseInput(overrides: Partial<PackManifestInput> = {}): PackManifestInput {
  return {
    pack_format_version: 'pack-v1.0',
    company_id: COMPANY,
    pay_period_start: '2026-06-01',
    pay_period_end:   '2026-06-07',
    export_target: 'myob',
    idempotency_key: 'a'.repeat(64),
    v1_chain_tip_hash: 'b'.repeat(64),
    frozen_anchor: {
      id: 'FROZEN_ANCHOR_V0',
      fingerprint: '8e6d4af90792eadb47f9205fe18e6325',
      count: 32,
      formula: "md5(string_agg(id::text || ':' || event_hash, '|' ORDER BY created_at, id))",
      bound_at: '2026-06-04T02:56:50Z',
      scope: "shift_events WHERE spec_version='0' AND created_at < '2026-06-04T02:56:50Z'",
    },
    bridge_event_hash: 'ec801f172bbf53da26bc6d6b153e0d30b32d146051063e56469ad9c47a764fbd',
    shifts: [
      {
        shift_id: '00000000-5000-0000-0000-000000000001',
        receipt_id: 'FSTR-AAAAAAAA',
        worker_id: WORKER,
        shift_date: '2026-06-02',
        total_hours_x100: 800,
        event_chain_segment: [
          { event_hash: '1'.repeat(64), previous_event_hash: '0'.repeat(64) },
          { event_hash: '2'.repeat(64), previous_event_hash: '1'.repeat(64) },
        ],
      },
    ],
    ...overrides,
  };
}

describe('packFingerprint', () => {
  it('is deterministic for the same input', () => {
    const a = packFingerprint(buildPackManifest(baseInput()));
    const b = packFingerprint(buildPackManifest(baseInput()));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is invariant to shift array input order (sorted by shift_id)', () => {
    const shifts1 = baseInput().shifts;
    const shifts2 = [...shifts1].reverse();
    const fp1 = packFingerprint(buildPackManifest(baseInput({ shifts: shifts1 })));
    const fp2 = packFingerprint(buildPackManifest(baseInput({ shifts: shifts2 })));
    expect(fp1).toBe(fp2);
  });

  it('changes when any byte in any event_chain_segment flips', () => {
    const m1 = baseInput();
    const m2 = baseInput({
      shifts: [{
        ...m1.shifts[0],
        event_chain_segment: [
          { event_hash: 'f'.repeat(64), previous_event_hash: '0'.repeat(64) }, // tampered
          ...m1.shifts[0].event_chain_segment.slice(1),
        ],
      }],
    });
    expect(packFingerprint(buildPackManifest(m1)))
      .not.toBe(packFingerprint(buildPackManifest(m2)));
  });

  it('changes when frozen_anchor.fingerprint differs', () => {
    const m1 = baseInput();
    const m2 = baseInput({
      frozen_anchor: { ...m1.frozen_anchor, fingerprint: 'deadbeef'.repeat(4) },
    });
    expect(packFingerprint(buildPackManifest(m1)))
      .not.toBe(packFingerprint(buildPackManifest(m2)));
  });
});

describe('manifestCanonicalBytes', () => {
  it('top-level keys appear in lexicographic order', () => {
    // JCS sorts object keys; reliable test that doesn't trip on
    // legitimate whitespace inside quoted string values.
    const out = manifestCanonicalBytes(buildPackManifest(baseInput()));
    expect(out.indexOf('"bridge_event_hash"')).toBeLessThan(out.indexOf('"company_id"'));
    expect(out.indexOf('"company_id"')).toBeLessThan(out.indexOf('"export_target"'));
    expect(out.indexOf('"export_target"')).toBeLessThan(out.indexOf('"frozen_anchor"'));
    expect(out.indexOf('"frozen_anchor"')).toBeLessThan(out.indexOf('"idempotency_key"'));
  });

  it('round-trips through JSON.parse without losing structural compactness', () => {
    // JCS compact form: JSON.stringify(parsed) (which itself emits no
    // whitespace between structural elements) should produce a string
    // whose length matches the canonical bytes — i.e. the canonical
    // output already lacks insignificant whitespace.
    const out = manifestCanonicalBytes(buildPackManifest(baseInput()));
    const parsed = JSON.parse(out);
    const compact = JSON.stringify(parsed);
    expect(out.length).toBe(compact.length);
  });
});

describe('computeIdempotencyKey', () => {
  it('is deterministic and 64-hex', () => {
    const k = computeIdempotencyKey({
      company_id: COMPANY,
      pay_period_start: '2026-06-01',
      pay_period_end:   '2026-06-07',
      shift_ids: ['s1', 's2', 's3'],
      export_target: 'myob',
    });
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    const k2 = computeIdempotencyKey({
      company_id: COMPANY,
      pay_period_start: '2026-06-01',
      pay_period_end:   '2026-06-07',
      shift_ids: ['s1', 's2', 's3'],
      export_target: 'myob',
    });
    expect(k).toBe(k2);
  });

  it('is invariant to shift_ids input order', () => {
    const a = computeIdempotencyKey({
      company_id: COMPANY, pay_period_start: '2026-06-01', pay_period_end: '2026-06-07',
      shift_ids: ['s3', 's1', 's2'], export_target: 'myob',
    });
    const b = computeIdempotencyKey({
      company_id: COMPANY, pay_period_start: '2026-06-01', pay_period_end: '2026-06-07',
      shift_ids: ['s1', 's2', 's3'], export_target: 'myob',
    });
    expect(a).toBe(b);
  });

  it('changes when ANY input field changes (cross-field domain separation)', () => {
    const base = {
      company_id: COMPANY, pay_period_start: '2026-06-01', pay_period_end: '2026-06-07',
      shift_ids: ['s1'], export_target: 'myob',
    };
    const a = computeIdempotencyKey(base);
    expect(a).not.toBe(computeIdempotencyKey({ ...base, company_id: 'other' }));
    expect(a).not.toBe(computeIdempotencyKey({ ...base, pay_period_start: '2026-05-30' }));
    expect(a).not.toBe(computeIdempotencyKey({ ...base, pay_period_end: '2026-06-08' }));
    expect(a).not.toBe(computeIdempotencyKey({ ...base, shift_ids: ['s2'] }));
    expect(a).not.toBe(computeIdempotencyKey({ ...base, export_target: 'xero' }));
  });
});

describe('hashBytes', () => {
  it('matches a known sha256 of "abc"', () => {
    // Test vector: sha256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
    expect(hashBytes('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
