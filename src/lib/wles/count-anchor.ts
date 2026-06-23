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

export type CountAnchorReason =
  | 'V1_COUNT_REGRESSION'
  | 'V1_TAIL_MISSING'
  // WLES-4 — v0 population coverage. The frozen v0 anchor recomputes a
  // count + fingerprint; a drop or fingerprint break is a v0 deletion/tamper.
  | 'V0_ANCHOR_MISMATCH'
  | 'V0_ANCHOR_MISSING';

export interface CountAnchorViolation {
  /** company_id for v1 regressions; the anchor id (e.g. FROZEN_ANCHOR_V0) for v0. */
  company_id: string;
  reason: CountAnchorReason;
  expected: string;
  actual: string;
}

/**
 * WLES-4 — a row of `v_anchor_verification` for a frozen-population anchor
 * (the view recomputes count + fingerprint inline and reports `matches`).
 */
export interface AnchorVerificationRow {
  id: string;
  expected_count: number;
  actual_count: number | null;
  /** null when the view has no inline formula for this anchor id. */
  matches: boolean | null;
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

/**
 * WLES-4 — make count-anchor coverage mandatory for EVERY population, not just
 * v1. The frozen v0 population is anchored by `v_anchor_verification` (count +
 * fingerprint recomputed inline). This folds that anchor into the same
 * count-anchor RED path the v1 watermark uses, so no population's deletion can
 * pass the primary integrity cron.
 *
 * A missing anchor row is itself a violation (someone dropped the anchor). A
 * `matches === null` row (no inline formula for that id) is skipped — that is a
 * "not covered here" signal, not a tamper, and is surfaced by the separate
 * anchor_fingerprint check.
 */
export function evaluateV0Anchor(
  anchors: AnchorVerificationRow[],
  requiredAnchorIds: readonly string[] = ['FROZEN_ANCHOR_V0'],
): CountAnchorViolation[] {
  const violations: CountAnchorViolation[] = [];
  const byId = new Map(anchors.map((a) => [a.id, a]));

  for (const id of requiredAnchorIds) {
    const a = byId.get(id);
    if (!a) {
      violations.push({
        company_id: id,
        reason: 'V0_ANCHOR_MISSING',
        expected: 'anchor present',
        actual: 'absent',
      });
      continue;
    }
    if (a.matches === false) {
      violations.push({
        company_id: a.id,
        reason: 'V0_ANCHOR_MISMATCH',
        expected: `count=${a.expected_count} & fingerprint match`,
        actual: `count=${a.actual_count ?? 'null'} matches=false`,
      });
    }
  }
  return violations;
}
