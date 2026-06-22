// Bot 12 — Lead scoring.
//
// Trigger: contact-change webhook | Runtime: EF | Gate: T0 | Model: none.
//
// Deterministic, explainable score over ICP fit + engagement. No LLM: the score
// must be auditable and reproducible. Returns the score plus the per-rule
// contributions so the "why" is always inspectable.

export const BOT_ID = 'bot-12-lead-scoring';

export interface LeadSignals {
  /** Australian construction labour-hire is the ICP. */
  industryIsConstructionLabourHire: boolean;
  /** Holds a relevant state licence (VIC/QLD/ACT etc.). */
  hasLabourHireLicence: boolean;
  /** Approx. number of workers; the metered unit. */
  workerCount: number;
  /** Engagement in the last 30 days. */
  openedEmail: boolean;
  visitedPricing: boolean;
  bookedDemo: boolean;
}

export interface ScoredLead {
  score: number; // 0-100, clamped
  band: 'cold' | 'warm' | 'hot';
  contributions: Array<{ rule: string; points: number }>;
}

const RULES: Array<{ rule: string; points: number; test: (s: LeadSignals) => boolean }> = [
  { rule: 'icp_industry', points: 30, test: (s) => s.industryIsConstructionLabourHire },
  { rule: 'has_licence', points: 20, test: (s) => s.hasLabourHireLicence },
  { rule: 'workers_gte_50', points: 15, test: (s) => s.workerCount >= 50 },
  { rule: 'workers_gte_10', points: 8, test: (s) => s.workerCount >= 10 && s.workerCount < 50 },
  { rule: 'opened_email', points: 5, test: (s) => s.openedEmail },
  { rule: 'visited_pricing', points: 12, test: (s) => s.visitedPricing },
  { rule: 'booked_demo', points: 25, test: (s) => s.bookedDemo },
];

/** Pure, explainable scoring. */
export function scoreLead(signals: LeadSignals): ScoredLead {
  const contributions = RULES.filter((r) => r.test(signals)).map((r) => ({
    rule: r.rule,
    points: r.points,
  }));
  const raw = contributions.reduce((sum, c) => sum + c.points, 0);
  const score = Math.max(0, Math.min(100, raw));
  const band: ScoredLead['band'] = score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold';
  return { score, band, contributions };
}
