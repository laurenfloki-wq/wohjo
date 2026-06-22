// Bot 11 — ICP list-building.
//
// Trigger: weekly | Runtime: pg_cron->EF | Gate: T1 | Model: Haiku (tag new
// licensees only). Steps: pull state licensing registers -> diff against known
// -> tag new -> create leads. The diff is pure and deterministic; only new
// licensees are added, so re-running never duplicates.

export const BOT_ID = 'bot-11-icp-list-building';

export interface Licensee {
  licenceNo: string;
  name: string;
  state: 'VIC' | 'QLD' | 'ACT' | 'NSW' | 'WA' | 'SA' | 'TAS' | 'NT';
}

/**
 * Pure diff: return only licensees whose licenceNo is not already known.
 * Idempotent by construction — a second run with the same known set yields
 * nothing new.
 */
export function newLicensees(
  pulled: ReadonlyArray<Licensee>,
  knownLicenceNos: ReadonlySet<string>,
): Licensee[] {
  const seen = new Set<string>();
  const out: Licensee[] = [];
  for (const l of pulled) {
    if (knownLicenceNos.has(l.licenceNo) || seen.has(l.licenceNo)) continue;
    seen.add(l.licenceNo);
    out.push(l);
  }
  return out;
}
