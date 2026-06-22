// Bot 12 — Lead scoring (FLOSMOSIS-calibrated).
//
// Trigger: contact-change webhook | Runtime: EF | Gate: T0 | Model: none.
//
// Deterministic, explainable, and bespoke to FLOSMOSIS's buying reality:
// construction labour-hire firms, where holding a MANDATORY labour-hire licence
// (VIC/QLD/SA/ACT) signals exactly the compliance pain the WLES sealed record
// solves; worker count maps to the pricing tier; and engagement with the
// evidentiary value prop (wage theft / Fair Work / WLES) is high intent.
// Thresholds live in bots/config.ts so the team tunes without code changes.

import { LEAD_SCORING, MANDATORY_LICENCE_STATES, TIER_ENTRY_WORKERS } from '../config';

export const BOT_ID = 'bot-12-lead-scoring';

export type AuState = 'VIC' | 'QLD' | 'ACT' | 'NSW' | 'WA' | 'SA' | 'TAS' | 'NT';

export interface LeadSignals {
  industryIsConstructionLabourHire: boolean;
  /** Holds a current labour-hire licence, and in which state. */
  labourHireLicence: { held: boolean; state: AuState | null };
  /** Active workers — the metered unit; maps to a pricing tier. */
  workerCount: number;
  /** Engaged with evidentiary content (WLES / wage-theft / Fair Work pages). */
  engagedEvidentiaryContent: boolean;
  visitedPricing: boolean;
  bookedDemo: boolean;
  openedEmail: boolean;
}

export type LeadBand = 'cold' | 'warm' | 'hot';

export interface ScoredLead {
  score: number; // 0-100, clamped
  band: LeadBand;
  /** Same-day SDR action recommended (hot ICP). */
  sdrSameDay: boolean;
  contributions: Array<{ rule: string; points: number }>;
}

function isMandatoryState(s: AuState | null): boolean {
  return s !== null && (MANDATORY_LICENCE_STATES as readonly string[]).includes(s);
}

/** Pure, explainable scoring calibrated to the FLOSMOSIS ICP. */
export function scoreLead(s: LeadSignals): ScoredLead {
  const w = LEAD_SCORING.weights;
  const c: Array<{ rule: string; points: number }> = [];

  if (s.industryIsConstructionLabourHire)
    c.push({ rule: 'icp_construction_labour_hire', points: w.industryConstructionLabourHire });

  if (s.labourHireLicence.held) {
    if (isMandatoryState(s.labourHireLicence.state)) {
      c.push({
        rule: `licence_mandatory_state_${s.labourHireLicence.state}`,
        points: w.holdsLicenceMandatoryState,
      });
    } else {
      c.push({ rule: 'licence_other_state', points: w.holdsLicenceOtherState });
    }
  }

  // Worker count -> pricing tier (highest applicable tier only; no double count).
  if (s.workerCount >= TIER_ENTRY_WORKERS.enterprise)
    c.push({ rule: 'workers_enterprise_tier', points: w.workersEnterpriseTier });
  else if (s.workerCount >= TIER_ENTRY_WORKERS.growth)
    c.push({ rule: 'workers_growth_tier', points: w.workersGrowthTier });
  else if (s.workerCount >= TIER_ENTRY_WORKERS.starter)
    c.push({ rule: 'workers_starter_tier', points: w.workersStarterTier });

  if (s.engagedEvidentiaryContent)
    c.push({ rule: 'engaged_evidentiary_content', points: w.engagedEvidentiaryContent });
  if (s.visitedPricing) c.push({ rule: 'visited_pricing', points: w.visitedPricing });
  if (s.bookedDemo) c.push({ rule: 'booked_demo', points: w.bookedDemo });
  if (s.openedEmail) c.push({ rule: 'opened_email', points: w.openedEmail });

  const score = Math.max(
    0,
    Math.min(
      100,
      c.reduce((sum, x) => sum + x.points, 0),
    ),
  );
  const band: LeadBand =
    score >= LEAD_SCORING.bands.hot ? 'hot' : score >= LEAD_SCORING.bands.warm ? 'warm' : 'cold';
  // Same-day SDR when hot AND a real construction labour-hire ICP (avoid chasing
  // high engagement from out-of-ICP tyre-kickers).
  const sdrSameDay = band === 'hot' && s.industryIsConstructionLabourHire;
  return { score, band, sdrSameDay, contributions: c };
}
