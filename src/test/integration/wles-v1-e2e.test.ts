// WLES v1.0 end-to-end path proof (SIMULATED — in-process).
//
// This exercises the REAL v1.0 code path — the same builders, the same
// canonical-JSON sealing, and the same chain verifier that the deployed
// shift routes invoke once WLES_V1_ENABLED=true — across the full
// lifecycle the dispatch's Phase 4 calls for:
//
//   forward-bridge -> CLOCK_IN -> CLOCK_OUT -> APPROVAL -> EXPORT_RECORD
//
// It is labelled SIMULATED because it drives the domain/sealing layer in
// process rather than POSTing through a deployed HTTP stack. A live HTTP
// E2E additionally requires the production env (service-role key, flag on)
// which is intentionally not present in CI. What this proves is the part
// that actually carries the integrity guarantee: that a real chain built
// by the real builders verifies, that the forward bridge anchors to the
// v0 tail WITHOUT rewriting it, and that any single-byte tamper is caught.

import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  buildSpecVersionMigration,
  buildClockIn,
  buildClockOut,
  buildApproval,
  buildExportRecord,
  ZERO_HASH,
} from '../../lib/wles/v1-translate';
import { sealEvent, verifyChain, hashEvent } from '../../lib/wles/v1';
import type { WlesEvent } from '../../lib/wles/v1-types';

// Ring-fenced, obviously-synthetic identifiers. Never real worker/customer data.
const TEST_COMPANY = 'TEST-COMPANY-0000-0000-000000000001';
const TEST_WORKER = 'TEST-WORKER-0000-0000-000000000001';
const TEST_SUPERVISOR = 'TEST-SUPERVISOR-0000-000000000001';
const TEST_SITE = 'TEST-SITE-0000-0000-000000000001';
const TEST_SHIFT = 'TEST-SHIFT-0000-0000-000000000001';

// A representative v0 chain tail hash — in production this is the value
// returned by the per-actor v0 chain query at cutover time. The bridge
// references it in its PAYLOAD (audit link) while starting the v1 chain
// at ZERO_HASH, so the 32 historical v0 events are never re-sealed.
const V0_CHAIN_TAIL = 'a'.repeat(64);

function buildRealV1Chain(): WlesEvent[] {
  const t = (offsetMin: number) => new Date(Date.UTC(2026, 5, 4, 1, offsetMin, 0)).toISOString();

  // 1. Forward bridge — v0 -> v1, anchored to the v0 tail, genesis of v1 chain.
  const bridge = sealEvent(
    buildSpecVersionMigration({
      actorId: TEST_COMPANY,
      subjectId: TEST_COMPANY,
      timestamp: t(0),
      previousEventHash: ZERO_HASH,
      fromSpecVersion: '0',
      toSpecVersion: '1.0',
      fromChainTailHash: V0_CHAIN_TAIL,
    }),
  );

  // 2. Clock-on (geofence detection).
  const clockIn = sealEvent(
    buildClockIn({
      actorId: TEST_WORKER,
      subjectId: TEST_WORKER,
      timestamp: t(5),
      previousEventHash: bridge.event_hash,
      shiftId: TEST_SHIFT,
      siteId: TEST_SITE,
      detectionMethod: 'geofence',
    }),
  );

  // 3. Clock-off.
  const clockOut = sealEvent(
    buildClockOut({
      actorId: TEST_WORKER,
      subjectId: TEST_WORKER,
      timestamp: t(485),
      previousEventHash: clockIn.event_hash,
      shiftId: TEST_SHIFT,
      siteId: TEST_SITE,
      startTimeSource: 'geofence',
    }),
  );

  // 4. Supervisor approval (web-link path).
  const approval = sealEvent(
    buildApproval({
      actorId: TEST_SUPERVISOR,
      subjectId: TEST_WORKER,
      timestamp: t(500),
      previousEventHash: clockOut.event_hash,
      shiftId: TEST_SHIFT,
      approvedHours: 8,
      approvalMethod: 'web',
    }),
  );

  // 5. Export record — seals the file hash into the chain.
  const exportRecord = sealEvent(
    buildExportRecord({
      actorId: TEST_COMPANY,
      subjectId: TEST_WORKER,
      timestamp: t(600),
      previousEventHash: approval.event_hash,
      shiftId: TEST_SHIFT,
      exportId: randomUUID(),
      provider: 'myob',
      fileHash: 'b'.repeat(64),
    }),
  );

  return [bridge, clockIn, clockOut, approval, exportRecord];
}

describe('WLES v1.0 E2E — full lifecycle through the real code path (SIMULATED)', () => {
  it('builds bridge -> clock-in -> clock-out -> approval -> export and verifies the chain', () => {
    const chain = buildRealV1Chain();
    const result = verifyChain(chain);
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.events_scanned).toBe(5);
  });

  it('emits the expected event_type sequence', () => {
    const chain = buildRealV1Chain();
    expect(chain.map((e) => e.event_type)).toEqual([
      'X-FLOSMOSIS-SPEC_VERSION_MIGRATION',
      'CLOCK_IN',
      'CLOCK_OUT',
      'APPROVAL',
      'X-FLOSMOSIS-EXPORT_RECORD',
    ]);
  });

  it('anchors the forward bridge to the v0 tail WITHOUT rewriting v0 (forward-only)', () => {
    const [bridge] = buildRealV1Chain();
    // v1 chain genesis links to ZERO_HASH...
    expect(bridge.previous_event_hash).toBe(ZERO_HASH);
    // ...while the audit link to the immutable v0 tail lives in the payload.
    expect((bridge.payload as Record<string, unknown>).from_chain_tail_hash).toBe(V0_CHAIN_TAIL);
    expect((bridge.payload as Record<string, unknown>).from_spec_version).toBe('0');
    expect((bridge.payload as Record<string, unknown>).to_spec_version).toBe('1.0');
  });

  it('every event hash is unique and self-consistent', () => {
    const chain = buildRealV1Chain();
    const hashes = new Set(chain.map((e) => e.event_hash));
    expect(hashes.size).toBe(chain.length);
    for (const ev of chain) {
      const { event_hash, ...rest } = ev;
      expect(hashEvent(rest)).toBe(event_hash);
    }
  });

  it('a single-byte tamper anywhere in the chain is detected', () => {
    const chain = buildRealV1Chain();
    // Tamper the approved hours after sealing — must break verification.
    const tampered = chain.map((e, i) =>
      i === 3
        ? { ...e, payload: { ...(e.payload as Record<string, unknown>), approved_hours: 9 } }
        : e,
    ) as WlesEvent[];
    const result = verifyChain(tampered);
    expect(result.ok).toBe(false);
    expect(result.failures.some((f) => f.reason === 'HASH_MISMATCH')).toBe(true);
  });

  it('the EXPORT_RECORD seals a concrete file hash into the verified chain', () => {
    const chain = buildRealV1Chain();
    const exportRecord = chain[chain.length - 1];
    expect(exportRecord.event_type).toBe('X-FLOSMOSIS-EXPORT_RECORD');
    expect((exportRecord.payload as Record<string, unknown>).file_hash).toMatch(/^[0-9a-f]{64}$/);
    expect((exportRecord.payload as Record<string, unknown>).provider).toBe('myob');
    // Its link back to the approval event must hold.
    expect(exportRecord.previous_event_hash).toBe(chain[chain.length - 2].event_hash);
  });
});
