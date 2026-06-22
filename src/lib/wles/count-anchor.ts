// WLES Theme A / audit A1 — live v1 count high-water-mark evaluation.
//
// The DB trigger advances a per-company monotonic watermark (event_count +
// tail_event_hash) on every v1 event insert. This pure function compares the
// CURRENTLY-LIVE v1 events to that watermark and reports a violation if the
// ledger has shrunk — i.e. events were deleted. Self-hash + linkage checks
// (chain-verify-spec-aware) cannot see a tail-truncation; the count can.
//
// No false positives: append-only corrections only ever GROW the count and the
// trigger advances the mark to the newest tail, so live >= mark and the
// recorded tail is always present in normal operation. A drop is real deletion.

export interface CompanyV1Snapshot {
  company_id: string;
  /** Number of currently-live v1 sealed events for the company. */
  liveV1Count: number;
  /** Hashes of the currently-live v1 events (same COALESCE form the trigger stores). */
  v1Hashes: Set<string>;
}

export interface V1Watermark {
  company_id: string;
  event_count: number;
  tail_event_hash: string | null;
}

export type CountAnchorReason = 'V1_COUNT_REGRESSION' | 'V1_TAIL_MISSING';

export interface CountAnchorViolation {
  company_id: string;
  reason: CountAnchorReason;
  expected: string;
  actual: string;
}

/**
 * Compare live v1 snapshots to the stored high-water-marks. Returns one
 * violation per detected regression. Companies without a watermark are skipped
 * (nothing has been sealed yet, so there is no floor to fall below).
 */
export function evaluateCountAnchor(
  snapshots: CompanyV1Snapshot[],
  watermarks: Map<string, V1Watermark>,
): CountAnchorViolation[] {
  const violations: CountAnchorViolation[] = [];
  for (const snap of snapshots) {
    const wm = watermarks.get(snap.company_id);
    if (!wm) continue;

    // The newest wage events were deleted: live count fell below the mark.
    if (snap.liveV1Count < wm.event_count) {
      violations.push({
        company_id: snap.company_id,
        reason: 'V1_COUNT_REGRESSION',
        expected: `>=${wm.event_count}`,
        actual: String(snap.liveV1Count),
      });
    }

    // The exact recorded tail event is gone (catches a tail swap even if the
    // count was concurrently topped back up by an unrelated insert).
    if (wm.tail_event_hash && !snap.v1Hashes.has(wm.tail_event_hash)) {
      violations.push({
        company_id: snap.company_id,
        reason: 'V1_TAIL_MISSING',
        expected: wm.tail_event_hash,
        actual: 'absent',
      });
    }
  }
  return violations;
}
