// Dual-time offline capture — server-side assessment.
//
// Decision 2026-07-02 (Option 1, approved by Lauren de Mestre): a shift
// record queued offline carries BOTH the device-asserted capture time and
// the server-verified seal time, labelled honestly, with device clock
// skew measured at sync and a bounded capture-to-seal gap.
//
// Evidentiary semantics — unchanged where it matters:
//   - CLOCK_IN `timestamp` remains the server-witnessed time (meter time).
//   - CLOCK_OUT continues to use the classifier-bounded worker-asserted
//     end time (existing behaviour since Day 6).
//   - The capture assertion + diagnostics live under the WLES v1.0 §9.2
//     extension namespace `x-flos-offline-capture`, so records remain
//     fully conformant with the published standard. Promotion to a core
//     optional field is a candidate for spec v1.1.
//
// See docs/design/offline-capture-dual-time.md for the full record.

/** Capture-to-seal gap beyond which the record is flagged for review. */
export const OFFLINE_CAPTURE_MAX_GAP_SECONDS = 12 * 60 * 60; // 12 hours

/** Devices may disagree with the server by a little without it meaning
 *  anything; assertions inside this window are not treated as "future". */
const FUTURE_TOLERANCE_SECONDS = 120;

export interface OfflineCaptureInput {
  captured_at?: unknown;
  client_now?: unknown;
}

export interface OfflineCaptureAssessment {
  /** Device-asserted moment the worker performed the action. */
  capturedAt: string;
  /** Device clock reading at the moment of sync (for skew measurement). */
  clientNowAtSync: string;
  /** Server-witnessed moment the record was received and sealed. */
  sealedAt: string;
  /** client_now - server_now at sync, in whole seconds (± = fast/slow). */
  clockSkewSeconds: number;
  /** captured_at translated onto the server clock using measured skew. */
  capturedAtSkewAdjusted: string;
  /** sealedAt - capturedAtSkewAdjusted, in whole seconds (floored at 0). */
  captureToSealSeconds: number;
  /** True when the gap exceeds OFFLINE_CAPTURE_MAX_GAP_SECONDS. */
  thresholdExceeded: boolean;
}

export type OfflineCaptureResult =
  | { ok: true; assessment: OfflineCaptureAssessment }
  | { ok: false; reason: string };

function parseIso(value: unknown): number | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export function assessOfflineCapture(
  input: OfflineCaptureInput,
  serverNow: Date,
): OfflineCaptureResult {
  const capturedAtMs = parseIso(input.captured_at);
  if (capturedAtMs === null) {
    return { ok: false, reason: 'offline.captured_at must be an ISO 8601 timestamp' };
  }
  const clientNowMs = parseIso(input.client_now);
  if (clientNowMs === null) {
    return { ok: false, reason: 'offline.client_now must be an ISO 8601 timestamp' };
  }
  if (capturedAtMs > clientNowMs + FUTURE_TOLERANCE_SECONDS * 1000) {
    return { ok: false, reason: 'offline.captured_at is after offline.client_now' };
  }

  const serverNowMs = serverNow.getTime();
  const clockSkewSeconds = Math.round((clientNowMs - serverNowMs) / 1000);
  const adjustedMs = capturedAtMs - clockSkewSeconds * 1000;
  if (adjustedMs > serverNowMs + FUTURE_TOLERANCE_SECONDS * 1000) {
    return {
      ok: false,
      reason: 'offline.captured_at resolves to the future after clock-skew adjustment',
    };
  }
  const captureToSealSeconds = Math.max(0, Math.round((serverNowMs - adjustedMs) / 1000));

  return {
    ok: true,
    assessment: {
      capturedAt: new Date(capturedAtMs).toISOString(),
      clientNowAtSync: new Date(clientNowMs).toISOString(),
      sealedAt: serverNow.toISOString(),
      clockSkewSeconds,
      capturedAtSkewAdjusted: new Date(adjustedMs).toISOString(),
      captureToSealSeconds,
      thresholdExceeded: captureToSealSeconds > OFFLINE_CAPTURE_MAX_GAP_SECONDS,
    },
  };
}

/** The §9.2 extension block, identical wherever it is embedded. */
export function offlineCaptureRecord(a: OfflineCaptureAssessment): Record<string, unknown> {
  return {
    captured_at: a.capturedAt,
    client_now_at_sync: a.clientNowAtSync,
    sealed_at: a.sealedAt,
    clock_skew_seconds: a.clockSkewSeconds,
    captured_at_skew_adjusted: a.capturedAtSkewAdjusted,
    capture_to_seal_seconds: a.captureToSealSeconds,
    capture_gap_threshold_seconds: OFFLINE_CAPTURE_MAX_GAP_SECONDS,
    capture_gap_exceeded: a.thresholdExceeded,
  };
}

/** WLES v1.0 §9.2 extension metadata for sealed events. */
export function offlineCaptureMetadata(
  a: OfflineCaptureAssessment,
): Record<string, unknown> {
  return { 'x-flos-offline-capture': offlineCaptureRecord(a) };
}
