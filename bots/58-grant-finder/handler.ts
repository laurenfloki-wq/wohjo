// Bot 58 — Grant-finder.
//
// Trigger: weekly | Runtime: pg_cron->EF | Gate: T3 submission | Model:
// Haiku/Sonnet (draft applications). Scans grant sources (CBRIN / Bulletpoint /
// Radium etc.); the eligibility screen is deterministic; Sonnet drafts
// applications; nothing is submitted without dual-control (T3).

export const BOT_ID = 'bot-58-grant-finder';

export interface Grant {
  id: string;
  title: string;
  /** Eligible jurisdictions, e.g. ['AU', 'ACT']. */
  jurisdictions: string[];
  /** Eligible sectors, e.g. ['saas', 'rd', 'construction-tech']. */
  sectors: string[];
  closesInDays: number;
  maxAmountCents: number;
}

export interface FleetCriteria {
  jurisdiction: string; // e.g. 'ACT'
  country: string; // 'AU'
  sectors: string[];
  minAmountCents: number;
}

export interface MatchedGrant extends Grant {
  matchedSectors: string[];
}

/**
 * Pure: filter to grants the company is eligible for — jurisdiction matches the
 * company's state or country, at least one sector overlaps, the grant is still
 * open, and the amount clears the floor. Soonest-closing first.
 */
export function matchGrants(grants: ReadonlyArray<Grant>, criteria: FleetCriteria): MatchedGrant[] {
  const wantSectors = new Set(criteria.sectors);
  const matched: MatchedGrant[] = [];
  for (const g of grants) {
    const jurisdictionOk =
      g.jurisdictions.includes(criteria.jurisdiction) || g.jurisdictions.includes(criteria.country);
    const matchedSectors = g.sectors.filter((s) => wantSectors.has(s));
    const open = g.closesInDays >= 0;
    const bigEnough = g.maxAmountCents >= criteria.minAmountCents;
    if (jurisdictionOk && matchedSectors.length > 0 && open && bigEnough) {
      matched.push({ ...g, matchedSectors });
    }
  }
  return matched.sort((a, b) => a.closesInDays - b.closesInDays);
}
