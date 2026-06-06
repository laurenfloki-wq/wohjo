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
// §7.6 APPROVAL — type-registry lock 2026-06-06: the single committed
// type for ALL supervisor approvals. `channel` distinguishes the
// delivery medium (sms via Twilio webhook vs web_link via verify
// token). No standalone SUPERVISOR_APPROVAL standard type.
// ──────────────────────────────────────────────────────────────────────
export function buildApproval(input: CommonEventInput & {
  shiftId: string;
  approvedHours: number;
  channel: ApprovalPayload['channel'];
  supervisorId?: string;
}): WlesEventUnsealed {
  if (!Number.isFinite(input.approvedHours) || input.approvedHours < 0) {
    throw new Error(`APPROVAL approved_hours must be non-negative finite, got ${input.approvedHours}`);
  }
  const payload: ApprovalPayload = {
    shift_id: input.shiftId,
    approved_hours: input.approvedHours,
    channel: input.channel,
    ...(input.supervisorId ? { supervisor_id: input.supervisorId } : {}),
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

// ──────────────────────────────────────────────────────────────────────
// FLOSTRUCTION lifecycle committed types — type-registry lock 2026-06-06.
// Each emits a bare-name WLES event_type per §7 (no X-FLOSMOSIS- prefix).
// ──────────────────────────────────────────────────────────────────────

export function buildDisputeRaised(input: CommonEventInput & {
  shiftId: string;
  reason: string;
  source?: 'web_verify' | 'sms' | 'command_admin' | 'worker_app';
}): WlesEventUnsealed {
  const payload: Record<string, unknown> = {
    shift_id: input.shiftId,
    reason: input.reason,
  };
  if (input.source) payload.source = input.source;
  return baseEvent(input, 'DISPUTE_RAISED', payload);
}

export function buildExportRecord(input: CommonEventInput & {
  shiftId: string;
  exportId: string;
  provider: string;
  fileHash: string;
}): WlesEventUnsealed {
  return baseEvent(input, 'EXPORT_RECORD', {
    shift_id: input.shiftId,
    export_id: input.exportId,
    provider: input.provider,
    file_hash: input.fileHash,
  });
}

export function buildPayrollApproval(input: CommonEventInput & {
  shiftId: string;
  receiptId: string;
  approvedByUserId: string;
  approvedAt: string;
}): WlesEventUnsealed {
  return baseEvent(input, 'PAYROLL_APPROVAL', {
    shift_id: input.shiftId,
    receipt_id: input.receiptId,
    approved_by_user_id: input.approvedByUserId,
    approved_at: input.approvedAt,
  });
}

// NOTE: buildSupervisorApproval intentionally removed. Per the WLES
// type-registry lock 2026-06-06, supervisor approvals (both web-link
// and SMS) flow through §7.6 APPROVAL via buildApproval(...) with the
// `channel` attribute set to 'web_link' or 'sms' respectively. There
// is no standalone SUPERVISOR_APPROVAL standard type.

export function buildCorrection(input: CommonEventInput & {
  shiftId: string;
  parentShiftEventId?: string | null;
  correctionReason: string;
  changes: Record<string, unknown>;
}): WlesEventUnsealed {
  const payload: Record<string, unknown> = {
    shift_id: input.shiftId,
    correction_reason: input.correctionReason,
    changes: input.changes,
  };
  if (input.parentShiftEventId) payload.parent_shift_event_id = input.parentShiftEventId;
  return baseEvent(input, 'CORRECTION', payload);
}

export function buildBugCorrection(input: CommonEventInput & {
  shiftId: string;
  parentShiftEventId?: string | null;
  correctionReason: string;
  defectReference: string;
  changes: Record<string, unknown>;
}): WlesEventUnsealed {
  const payload: Record<string, unknown> = {
    shift_id: input.shiftId,
    correction_reason: input.correctionReason,
    defect_reference: input.defectReference,
    changes: input.changes,
  };
  if (input.parentShiftEventId) payload.parent_shift_event_id = input.parentShiftEventId;
  return baseEvent(input, 'BUG_CORRECTION', payload);
}

/**
 * X-FLOSMOSIS-WORKER_CREATED — worker-roster onboarding event.
 *
 * Type-registry note (substrate review 2026-06-06): WORKER_CREATED's
 * final wles_event.event_type is pending Lauren's call as part of the
 * WLES v1.0 type-registry decision. Until that lock, the route
 * gates production minting on the WLES_TYPE_REGISTRY_LOCKED env so
 * no shift_events row can be sealed with a string that may be
 * renamed later. The substrate column always uses the canonical
 * 'WORKER_CREATED' bare name (Option B); only the WLES payload type
 * is under review.
 */
export function buildWorkerCreated(input: CommonEventInput & {
  workerId: string;
  employeeId: string;
  employeeName: string;
  phoneE164: string;
  myobCardId?: string | null;
  createdVia: 'bulk_upload' | 'single_form' | 'api';
}): WlesEventUnsealed {
  return baseEvent(input, 'WORKER_CREATED', {
    worker_id: input.workerId,
    employee_id: input.employeeId,
    employee_name: input.employeeName,
    phone_e164: input.phoneE164,
    myob_card_id: input.myobCardId ?? null,
    created_via: input.createdVia,
  });
}

export function buildWorkerDisputeFiled(input: CommonEventInput & {
  disputeId: string;
  disputeType: string;
  relatedShiftId?: string | null;
}): WlesEventUnsealed {
  const payload: Record<string, unknown> = {
    dispute_id: input.disputeId,
    dispute_type: input.disputeType,
  };
  if (input.relatedShiftId) payload.related_shift_id = input.relatedShiftId;
  return baseEvent(input, 'WORKER_DISPUTE_FILED', payload);
}

/**
 * X-FLOSMOSIS-SPEC_VERSION_ANOMALY — payload-level attestation of a
 * spec_version stamping defect that produced rows after the cutover
 * which carry spec_version='0'. The annotation references the
 * affected event ids and hashes IN ITS SIGNED PAYLOAD; it does NOT
 * chain to them via previous_event_hash (which links to the v1 tail).
 * This is an explanation, not a chain repair.
 */
export function buildSpecVersionAnomaly(input: CommonEventInput & {
  defect: string;
  rootCauseSummary: string;
  remediationPr: string;
  affectedEventIds: string[];
  affectedEventHashes: string[];
  originalSpecVersion: string;
  intendedSpecVersion: string;
}): WlesEventUnsealed {
  if (input.affectedEventIds.length !== input.affectedEventHashes.length) {
    throw new Error('affectedEventIds and affectedEventHashes must be parallel arrays of equal length');
  }
  return buildExtensionEvent({
    ...input,
    eventType: 'X-FLOSMOSIS-SPEC_VERSION_ANOMALY',
    payload: {
      defect: input.defect,
      root_cause_summary: input.rootCauseSummary,
      remediation_pr: input.remediationPr,
      affected_event_ids: input.affectedEventIds,
      affected_event_hashes: input.affectedEventHashes,
      original_spec_version: input.originalSpecVersion,
      intended_spec_version: input.intendedSpecVersion,
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
