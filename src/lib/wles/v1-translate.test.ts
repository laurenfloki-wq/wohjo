// Coverage: v1-translate.ts — all 12 builder functions.
// The existing v1-chain.test.ts covers buildClockIn indirectly;
// this file covers every other builder and all validation paths.

import { describe, it, expect } from 'vitest';
import {
  buildShiftCommit,
  buildClockIn,
  buildClockOut,
  buildBreakStart,
  buildBreakEnd,
  buildApproval,
  buildIntelligenceClear,
  buildAnomalyFlag,
  buildExtensionEvent,
  buildDisputeRaised,
  buildExportRecord,
  buildSpecVersionMigration,
  ZERO_HASH,
} from './v1-translate';

const ACTOR = 'actor-uuid-0001';
const SUBJ = 'subject-uuid-0001';
const SHIFT = 'shift-uuid-0001';
const SITE = 'site-uuid-0001';
const TS = '2026-05-10T08:00:00.000Z';

const common = {
  actorId: ACTOR,
  subjectId: SUBJ,
  timestamp: TS,
  previousEventHash: ZERO_HASH,
};

// ─────────────────────────────────────────────────────────────────────────────
// SHIFT_COMMIT
// ─────────────────────────────────────────────────────────────────────────────

describe('buildShiftCommit', () => {
  it('builds a minimal SHIFT_COMMIT event', () => {
    const ev = buildShiftCommit({ ...common, shiftId: SHIFT, siteId: SITE });
    expect(ev.event_type).toBe('SHIFT_COMMIT');
    expect(ev.payload).toMatchObject({ shift_id: SHIFT, site_id: SITE });
    expect(ev.previous_event_hash).toBe(ZERO_HASH);
    expect(ev.actor_id).toBe(ACTOR);
    expect(ev.subject_id).toBe(SUBJ);
  });

  it('includes optional scheduled fields when supplied', () => {
    const ev = buildShiftCommit({
      ...common,
      shiftId: SHIFT,
      siteId: SITE,
      scheduledStart: '2026-05-10T06:00:00.000Z',
      scheduledEnd: '2026-05-10T14:00:00.000Z',
    });
    expect(ev.payload).toMatchObject({
      scheduled_start: '2026-05-10T06:00:00.000Z',
      scheduled_end: '2026-05-10T14:00:00.000Z',
    });
  });

  it('uses a caller-supplied eventId', () => {
    const ev = buildShiftCommit({ ...common, eventId: 'fixed-id', shiftId: SHIFT, siteId: SITE });
    expect(ev.event_id).toBe('fixed-id');
  });

  it('generates a UUID when eventId is omitted', () => {
    const ev = buildShiftCommit({ ...common, shiftId: SHIFT, siteId: SITE });
    expect(ev.event_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('includes metadata when supplied', () => {
    const meta = { source: 'test' } as Record<string, unknown>;
    const ev = buildShiftCommit({ ...common, shiftId: SHIFT, siteId: SITE, metadata: meta });
    expect((ev as Record<string, unknown>).metadata).toEqual(meta);
  });

  it('metadata is undefined when not supplied', () => {
    const ev = buildShiftCommit({ ...common, shiftId: SHIFT, siteId: SITE }) as Record<
      string,
      unknown
    >;
    expect(ev.metadata).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CLOCK_IN
// ─────────────────────────────────────────────────────────────────────────────

describe('buildClockIn', () => {
  it('builds a CLOCK_IN with geofence detection', () => {
    const ev = buildClockIn({
      ...common,
      shiftId: SHIFT,
      siteId: SITE,
      detectionMethod: 'geofence',
    });
    expect(ev.event_type).toBe('CLOCK_IN');
    expect(ev.payload).toMatchObject({ detection_method: 'geofence' });
  });

  it('includes geofence_detected_at when supplied', () => {
    const ev = buildClockIn({
      ...common,
      shiftId: SHIFT,
      siteId: SITE,
      detectionMethod: 'geofence',
      geofenceDetectedAt: '2026-05-10T07:59:45.000Z',
    });
    expect(ev.payload).toMatchObject({ geofence_detected_at: '2026-05-10T07:59:45.000Z' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CLOCK_OUT
// ─────────────────────────────────────────────────────────────────────────────

describe('buildClockOut', () => {
  it('builds a minimal CLOCK_OUT', () => {
    const ev = buildClockOut({ ...common, shiftId: SHIFT, siteId: SITE });
    expect(ev.event_type).toBe('CLOCK_OUT');
    expect(ev.payload).toMatchObject({ shift_id: SHIFT, site_id: SITE });
  });

  it('includes optional worker_confirmed_start_at and start_time_source', () => {
    const ev = buildClockOut({
      ...common,
      shiftId: SHIFT,
      siteId: SITE,
      workerConfirmedStartAt: '2026-05-10T06:05:00.000Z',
      startTimeSource: 'worker_confirmed',
    });
    expect(ev.payload).toMatchObject({
      worker_confirmed_start_at: '2026-05-10T06:05:00.000Z',
      start_time_source: 'worker_confirmed',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BREAK_START
// ─────────────────────────────────────────────────────────────────────────────

describe('buildBreakStart', () => {
  it('builds a minimal BREAK_START', () => {
    const ev = buildBreakStart({ ...common, shiftId: SHIFT });
    expect(ev.event_type).toBe('BREAK_START');
    expect(ev.payload).toMatchObject({ shift_id: SHIFT });
  });

  it('includes break_type when supplied', () => {
    const ev = buildBreakStart({ ...common, shiftId: SHIFT, breakType: 'meal' });
    expect(ev.payload).toMatchObject({ break_type: 'meal' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BREAK_END
// ─────────────────────────────────────────────────────────────────────────────

describe('buildBreakEnd', () => {
  it('builds a minimal BREAK_END', () => {
    const ev = buildBreakEnd({ ...common, shiftId: SHIFT });
    expect(ev.event_type).toBe('BREAK_END');
    expect(ev.payload).toMatchObject({ shift_id: SHIFT });
  });

  it('includes break_start_event_id when supplied', () => {
    const ev = buildBreakEnd({ ...common, shiftId: SHIFT, breakStartEventId: 'bs-evt-001' });
    expect(ev.payload).toMatchObject({ break_start_event_id: 'bs-evt-001' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// APPROVAL
// ─────────────────────────────────────────────────────────────────────────────

describe('buildApproval', () => {
  it('builds an APPROVAL with manual method', () => {
    const ev = buildApproval({
      ...common,
      shiftId: SHIFT,
      approvedHours: 8.75,
      approvalMethod: 'sms',
    });
    expect(ev.event_type).toBe('APPROVAL');
    expect(ev.payload).toMatchObject({ approved_hours: 8.75, approval_method: 'sms' });
  });

  it('throws for negative approved_hours', () => {
    expect(() =>
      buildApproval({ ...common, shiftId: SHIFT, approvedHours: -1, approvalMethod: 'sms' }),
    ).toThrow('non-negative');
  });

  it('throws for NaN approved_hours', () => {
    expect(() =>
      buildApproval({ ...common, shiftId: SHIFT, approvedHours: NaN, approvalMethod: 'sms' }),
    ).toThrow('non-negative');
  });

  it('accepts zero approved_hours (unpaid standby)', () => {
    const ev = buildApproval({
      ...common,
      shiftId: SHIFT,
      approvedHours: 0,
      approvalMethod: 'other',
    });
    expect(ev.payload).toMatchObject({ approved_hours: 0 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// INTELLIGENCE_CLEAR
// ─────────────────────────────────────────────────────────────────────────────

describe('buildIntelligenceClear', () => {
  it('builds an INTELLIGENCE_CLEAR event', () => {
    const ev = buildIntelligenceClear({
      ...common,
      shiftId: SHIFT,
      checksPerformed: ['geofence', 'overlap'],
      checkVersion: '1.2.0',
    });
    expect(ev.event_type).toBe('INTELLIGENCE_CLEAR');
    expect(ev.payload).toMatchObject({
      checks_performed: ['geofence', 'overlap'],
      check_version: '1.2.0',
    });
  });

  it('throws for empty checks array', () => {
    expect(() =>
      buildIntelligenceClear({
        ...common,
        shiftId: SHIFT,
        checksPerformed: [],
        checkVersion: '1.0.0',
      }),
    ).toThrow('non-empty');
  });

  it('throws for non-array checksPerformed', () => {
    expect(() =>
      buildIntelligenceClear({
        ...common,
        shiftId: SHIFT,
        checksPerformed: null as unknown as string[],
        checkVersion: '1.0.0',
      }),
    ).toThrow('non-empty');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ANOMALY_FLAG
// ─────────────────────────────────────────────────────────────────────────────

describe('buildAnomalyFlag', () => {
  it('builds an ANOMALY_FLAG event', () => {
    const ev = buildAnomalyFlag({
      ...common,
      shiftId: SHIFT,
      anomalyType: 'OVERLAP_DETECTED',
      severity: 'medium',
    });
    expect(ev.event_type).toBe('ANOMALY_FLAG');
    expect(ev.payload).toMatchObject({
      anomaly_type: 'OVERLAP_DETECTED',
      severity: 'medium',
    });
  });

  it('includes details when supplied', () => {
    const ev = buildAnomalyFlag({
      ...common,
      shiftId: SHIFT,
      anomalyType: 'GEOFENCE_MISS',
      severity: 'low',
      details: 'GPS accuracy 80m — outside 50m fence radius',
    });
    expect(ev.payload).toMatchObject({ details: 'GPS accuracy 80m — outside 50m fence radius' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EXTENSION_EVENT (generic)
// ─────────────────────────────────────────────────────────────────────────────

describe('buildExtensionEvent', () => {
  it('builds a valid extension event', () => {
    const ev = buildExtensionEvent({
      ...common,
      eventType: 'X-FLOSMOSIS-TEST_EVENT',
      payload: { shift_id: SHIFT, note: 'test' },
    });
    expect(ev.event_type).toBe('X-FLOSMOSIS-TEST_EVENT');
    expect(ev.payload).toMatchObject({ shift_id: SHIFT });
  });

  it('throws for invalid event_type prefix', () => {
    expect(() =>
      buildExtensionEvent({
        ...common,
        eventType: 'INVALID-EVENT',
        payload: { shift_id: SHIFT },
      }),
    ).toThrow('X-<NS>-<NAME>');
  });

  it('throws for a plain name with no namespace', () => {
    expect(() =>
      buildExtensionEvent({
        ...common,
        eventType: 'X-NONS',
        payload: {},
      }),
    ).toThrow('X-<NS>-<NAME>');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DISPUTE_RAISED (convenience wrapper)
// ─────────────────────────────────────────────────────────────────────────────

describe('buildDisputeRaised', () => {
  it('builds X-FLOSMOSIS-DISPUTE_RAISED event', () => {
    const ev = buildDisputeRaised({ ...common, shiftId: SHIFT, reason: 'Hours incorrect' });
    expect(ev.event_type).toBe('X-FLOSMOSIS-DISPUTE_RAISED');
    expect(ev.payload).toMatchObject({ shift_id: SHIFT, reason: 'Hours incorrect' });
  });

  it('merges extra fields into payload', () => {
    const ev = buildDisputeRaised({
      ...common,
      shiftId: SHIFT,
      reason: 'Site mismatch',
      extra: { claimed_site_id: 'other-site' },
    });
    expect(ev.payload).toMatchObject({ claimed_site_id: 'other-site' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT_RECORD (convenience wrapper)
// ─────────────────────────────────────────────────────────────────────────────

describe('buildExportRecord', () => {
  it('builds X-FLOSMOSIS-EXPORT_RECORD event', () => {
    const ev = buildExportRecord({
      ...common,
      shiftId: SHIFT,
      exportId: 'exp-001',
      provider: 'employment_hero',
      fileHash: 'abc123',
    });
    expect(ev.event_type).toBe('X-FLOSMOSIS-EXPORT_RECORD');
    expect(ev.payload).toMatchObject({
      shift_id: SHIFT,
      export_id: 'exp-001',
      provider: 'employment_hero',
      file_hash: 'abc123',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SPEC_VERSION_MIGRATION (bridge event)
// ─────────────────────────────────────────────────────────────────────────────

describe('buildSpecVersionMigration', () => {
  it('builds X-FLOSMOSIS-SPEC_VERSION_MIGRATION event with defaults', () => {
    const ev = buildSpecVersionMigration({
      ...common,
      fromSpecVersion: '0',
      toSpecVersion: '1.0',
      fromChainTailHash: null,
    });
    expect(ev.event_type).toBe('X-FLOSMOSIS-SPEC_VERSION_MIGRATION');
    expect(ev.payload).toMatchObject({
      from_spec_version: '0',
      to_spec_version: '1.0',
      from_chain_tail_hash: null,
    });
    expect((ev.payload as Record<string, unknown>).reason).toBe(
      'Reference implementation conformance activation',
    );
  });

  it('uses a caller-supplied reason', () => {
    const ev = buildSpecVersionMigration({
      ...common,
      fromSpecVersion: '0',
      toSpecVersion: '1.0',
      fromChainTailHash: 'deadbeef' + '0'.repeat(56),
      reason: 'Manual migration',
    });
    expect((ev.payload as Record<string, unknown>).reason).toBe('Manual migration');
  });
});
