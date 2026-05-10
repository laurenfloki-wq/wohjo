// WLES v1.0 translation — construct spec-shape WlesEvents from
// FLOSTRUCTION domain inputs.
//
// These helpers are the sole authorised path for creating new
// v1.0-sealed shift events. Callers supply domain inputs; helpers
// return an unsealed WlesEvent ready to be passed to sealEvent().
//
// Per the 2026-04-24 transition policy, these helpers are used only
// for NEW events (spec_version='1.0'). Legacy v0 events remain
// sealed via the existing `generateEventHash()` in hash.ts and are
// NOT re-translated.

import { randomUUID } from 'crypto';
import { ZERO_HASH } from './v1-types';
import type {
  WlesEventUnsealed, WlesMetadata,
  ShiftCommitPayload, ClockInPayload, ClockOutPayload,
  BreakStartPayload, BreakEndPayload,
  ApprovalPayload, IntelligenceClearPayload, AnomalyFlagPayload,
  ExtensionPayload,
} from './v1-types';

// ──────────────────────────────────────────────────────────────────────
// Common input — fields shared across every constructor
// ──────────────────────────────────────────────────────────────────────

export interface CommonEventInput {
  /** Event UUID. If omitted, one is generated. */
  eventId?: string;
  /** Actor's opaque identifier — the entity performing this action. */
  actorId: string;
  /** Subject's opaque identifier — the entity whose labour is recorded. */
  subjectId: string;
  /** Time of the real-world event. ISO 8601 UTC ms precision. */
  timestamp: string;
  /**
   * Previous event's event_hash. ZERO_HASH if this is the first
   * v1.0 event in the chain (chain genesis).
   */
  previousEventHash: string;
  /** Optional metadata per §4.9. */
  metadata?: WlesMetadata;
}

function baseEvent(
  common: CommonEventInput,
  event_type: string,
  payload: Record<string, unknown>,
): WlesEventUnsealed {
  return {
    event_id: common.eventId ?? randomUUID(),
    event_type,
    previous_event_hash: common.previousEventHash,
    actor_id: common.actorId,
    subject_id: common.subjectId,
    timestamp: common.timestamp,
    payload,
    ...(common.metadata !== undefined ? { metadata: common.metadata } : {}),
  };
}

// ──────────────────────────────────────────────────────────────────────
// §7.1 SHIFT_COMMIT
// ──────────────────────────────────────────────────────────────────────
export function buildShiftCommit(input: CommonEventInput & {
  shiftId: string;
  siteId: string;
  scheduledStart?: string;
  scheduledEnd?: string;
}): WlesEventUnsealed {
  const payload: ShiftCommitPayload = {
    shift_id: input.shiftId,
    site_id: input.siteId,
  };
  if (input.scheduledStart) payload.scheduled_start = input.scheduledStart;
  if (input.scheduledEnd) payload.scheduled_end = input.scheduledEnd;
  return baseEvent(input, 'SHIFT_COMMIT', payload as unknown as Record<string, unknown>);
}

// ──────────────────────────────────────────────────────────────────────
// §7.2 CLOCK_IN
// ──────────────────────────────────────────────────────────────────────
export function buildClockIn(input: CommonEventInput & {
  shiftId: string;
  siteId: string;
  detectionMethod: ClockInPayload['detection_method'];
  geofenceDetectedAt?: string;
}): WlesEventUnsealed {
  const payload: ClockInPayload = {
    shift_id: input.shiftId,
    site_id: input.siteId,
    detection_method: input.detectionMethod,
  };
  if (input.geofenceDetectedAt) payload.geofence_detected_at = input.geofenceDetectedAt;
  return baseEvent(input, 'CLOCK_IN', payload as unknown as Record<string, unknown>);
}

// ──────────────────────────────────────────────────────────────────────
// §7.3 CLOCK_OUT
// ──────────────────────────────────────────────────────────────────────
export function buildClockOut(input: CommonEventInput & {
  shiftId: string;
  siteId: string;
  workerConfirmedStartAt?: string;
  startTimeSource?: ClockOutPayload['start_time_source'];
}): WlesEventUnsealed {
  const payload: ClockOutPayload = {
    shift_id: input.shiftId,
    site_id: input.siteId,
  };
  if (input.workerConfirmedStartAt) payload.worker_confirmed_start_at = input.workerConfirmedStartAt;
  if (input.startTimeSource) payload.start_time_source = input.startTimeSource;
  return baseEvent(input, 'CLOCK_OUT', payload as unknown as Record<string, unknown>);
}

// ──────────────────────────────────────────────────────────────────────
// §7.4 BREAK_START
// ──────────────────────────────────────────────────────────────────────
export function buildBreakStart(input: CommonEventInput & {
  shiftId: string;
  breakType?: BreakStartPayload['break_type'];
}): WlesEventUnsealed {
  const payload: BreakStartPayload = { shift_id: input.shiftId };
  if (input.breakType) payload.break_type = input.breakType;
  return baseEvent(input, 'BREAK_START', payload as unknown as Record<string, unknown>);
}

// ──────────────────────────────────────────────────────────────────────
// §7.5 BREAK_END
// ──────────────────────────────────────────────────────────────────────
export function buildBreakEnd(input: CommonEventInput & {
  shiftId: string;
  breakStartEventId?: string;
}): WlesEventUnsealed {
  const payload: BreakEndPayload = { shift_id: input.shiftId };
  if (input.breakStartEventId) payload.break_start_event_id = input.breakStartEventId;
  return baseEvent(input, 'BREAK_END', payload as unknown as Record<string, unknown>);
}

// ──────────────────────────────────────────────────────────────────────
// §7.6 APPROVAL
// ──────────────────────────────────────────────────────────────────────
export function buildApproval(input: CommonEventInput & {
  shiftId: string;
  approvedHours: number;
  approvalMethod: ApprovalPayload['approval_method'];
}): WlesEventUnsealed {
  if (!Number.isFinite(input.approvedHours) || input.approvedHours < 0) {
    throw new Error(`APPROVAL approved_hours must be non-negative finite, got ${input.approvedHours}`);
  }
  const payload: ApprovalPayload = {
    shift_id: input.shiftId,
    approved_hours: input.approvedHours,
    approval_method: input.approvalMethod,
  };
  return baseEvent(input, 'APPROVAL', payload as unknown as Record<string, unknown>);
}

// ──────────────────────────────────────────────────────────────────────
// §7.7 INTELLIGENCE_CLEAR
// ──────────────────────────────────────────────────────────────────────
export function buildIntelligenceClear(input: CommonEventInput & {
  shiftId: string;
  checksPerformed: string[];
  checkVersion: string;
}): WlesEventUnsealed {
  if (!Array.isArray(input.checksPerformed) || input.checksPerformed.length === 0) {
    throw new Error('INTELLIGENCE_CLEAR checksPerformed must be a non-empty array');
  }
  const payload: IntelligenceClearPayload = {
    shift_id: input.shiftId,
    checks_performed: input.checksPerformed,
    check_version: input.checkVersion,
  };
  return baseEvent(input, 'INTELLIGENCE_CLEAR', payload as unknown as Record<string, unknown>);
}

// ──────────────────────────────────────────────────────────────────────
// §7.8 ANOMALY_FLAG
// ──────────────────────────────────────────────────────────────────────
export function buildAnomalyFlag(input: CommonEventInput & {
  shiftId: string;
  anomalyType: string;
  severity: AnomalyFlagPayload['severity'];
  details?: string;
}): WlesEventUnsealed {
  const payload: AnomalyFlagPayload = {
    shift_id: input.shiftId,
    anomaly_type: input.anomalyType,
    severity: input.severity,
  };
  if (input.details) payload.details = input.details;
  return baseEvent(input, 'ANOMALY_FLAG', payload as unknown as Record<string, unknown>);
}

// ──────────────────────────────────────────────────────────────────────
// §9 extension events — FLOSTRUCTION-specific
// ──────────────────────────────────────────────────────────────────────
export function buildExtensionEvent(input: CommonEventInput & {
  eventType: string; // must match /^X-<NS>-<NAME>/
  payload: ExtensionPayload;
}): WlesEventUnsealed {
  if (!/^X-[A-Z0-9_]+-[A-Z0-9_]+/i.test(input.eventType)) {
    throw new Error(`Extension event_type must match /^X-<NS>-<NAME>/: got "${input.eventType}"`);
  }
  return baseEvent(input, input.eventType, input.payload as unknown as Record<string, unknown>);
}

// FLOSTRUCTION-defined extensions, pre-wrapped for call-site ergonomics.
export function buildDisputeRaised(input: CommonEventInput & {
  shiftId: string;
  reason: string;
  extra?: Record<string, unknown>;
}): WlesEventUnsealed {
  const payload: ExtensionPayload = { shift_id: input.shiftId, reason: input.reason };
  if (input.extra) Object.assign(payload, input.extra);
  return buildExtensionEvent({ ...input, eventType: 'X-FLOSMOSIS-DISPUTE_RAISED', payload });
}

export function buildExportRecord(input: CommonEventInput & {
  shiftId: string;
  exportId: string;
  provider: string;
  fileHash: string;
}): WlesEventUnsealed {
  return buildExtensionEvent({
    ...input,
    eventType: 'X-FLOSMOSIS-EXPORT_RECORD',
    payload: {
      shift_id: input.shiftId,
      export_id: input.exportId,
      provider: input.provider,
      file_hash: input.fileHash,
    },
  });
}

// ──────────────────────────────────────────────────────────────────────
// Bridge event — v0 → v1 migration record (per transition policy §4c)
// ──────────────────────────────────────────────────────────────────────
export function buildSpecVersionMigration(input: CommonEventInput & {
  fromSpecVersion: string;
  toSpecVersion: string;
  fromChainTailHash: string | null;
  reason?: string;
}): WlesEventUnsealed {
  return buildExtensionEvent({
    ...input,
    eventType: 'X-FLOSMOSIS-SPEC_VERSION_MIGRATION',
    payload: {
      from_spec_version: input.fromSpecVersion,
      to_spec_version: input.toSpecVersion,
      from_chain_tail_hash: input.fromChainTailHash,
      reason: input.reason ?? 'Reference implementation conformance activation',
    },
  });
}

// ──────────────────────────────────────────────────────────────────────
// Re-export for convenience
// ──────────────────────────────────────────────────────────────────────
export { ZERO_HASH };
