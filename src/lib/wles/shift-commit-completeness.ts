// WLES-6 — shift_commit_completeness evaluation.
//
// A shift that has advanced past IN_PROGRESS must carry a sealed SHIFT_COMMIT
// event. The degraded-200 path in /api/field/shift/end can leave a shift
// SUBMITTED with no commit — approvable and payable without its attestation,
// and invisible to chain-verify (which sees broken links, not missing events).
// The v_shift_commit_orphans view surfaces candidates; this filters out a
// documented baseline of known seed/pilot orphans (mirrors chain-baseline.ts).

// Known seed/pilot shifts accepted as not-an-incident. The all-9s UUID is a
// 2026-06-06 pilot EXPORTED shift carrying only an EXPORT_RECORD (no event
// chain) — it predates full event-chain seeding and is not a real worker shift.
export const SHIFT_COMMIT_BASELINE: ReadonlySet<string> = new Set<string>([
  '99999999-9999-4999-8999-999999999992',
]);

export interface OrphanShift {
  shift_id: string;
  status: string;
}

/**
 * Return the orphan shifts that are NOT in the accepted baseline. A non-empty
 * result means a real shift can be approved/paid without a sealed SHIFT_COMMIT
 * — RED.
 */
export function nonBaselineOrphans(
  orphans: OrphanShift[],
  baseline: ReadonlySet<string> = SHIFT_COMMIT_BASELINE,
): OrphanShift[] {
  return orphans.filter((o) => !baseline.has(o.shift_id));
}
