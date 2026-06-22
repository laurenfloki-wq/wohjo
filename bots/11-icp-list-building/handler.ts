// Bot 11 — ICP list-building (FLOSMOSIS-calibrated).
//
// Trigger: weekly | Runtime: pg_cron->EF | Gate: T1 | Model: Haiku (tag).
//
// The labour-hire licence registers are FLOSMOSIS's sharpest top-of-funnel asset:
// a current, intent-rich list of exactly the firms that must keep defensible
// time records. New licensees in MANDATORY-scheme states (VIC/QLD/SA/ACT) are
// prioritised — they carry the compliance obligation the WLES record satisfies.
// Pure diff + priority score; idempotent (only-new). Thresholds in config.

import { ICP, MANDATORY_LICENCE_STATES } from '../config';

export const BOT_ID = 'bot-11-icp-list-building';

export type AuState = 'VIC' | 'QLD' | 'ACT' | 'NSW' | 'WA' | 'SA' | 'TAS' | 'NT';

export interface Licensee {
  licenceNo: string;
  name: string;
  state: AuState;
}

export interface PrioritisedLicensee extends Licensee {
  /** Higher = pursue first. Mandatory-scheme states lead. */
  priority: number;
  mandatoryScheme: boolean;
}

function isMandatory(state: AuState): boolean {
  return (MANDATORY_LICENCE_STATES as readonly string[]).includes(state);
}

/**
 * Pure: return only licensees not already known, scored and ordered by ICP
 * priority (mandatory-scheme states first). Idempotent — a second run with the
 * same known set yields nothing; intra-pull duplicates collapse.
 */
export function newLicensees(
  pulled: ReadonlyArray<Licensee>,
  knownLicenceNos: ReadonlySet<string>,
): PrioritisedLicensee[] {
  const seen = new Set<string>();
  const out: PrioritisedLicensee[] = [];
  for (const l of pulled) {
    if (knownLicenceNos.has(l.licenceNo) || seen.has(l.licenceNo)) continue;
    seen.add(l.licenceNo);
    const mandatoryScheme = isMandatory(l.state);
    out.push({
      ...l,
      mandatoryScheme,
      priority: mandatoryScheme ? ICP.mandatoryStatePriority : ICP.otherStatePriority,
    });
  }
  return out.sort((a, b) => b.priority - a.priority);
}
