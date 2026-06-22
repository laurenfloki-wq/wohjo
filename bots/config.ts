// config.ts — FLOSMOSIS-calibrated business thresholds for the fleet.
//
// One place for every tunable decision threshold, so the growth/ops team tunes
// behaviour without touching handler logic or redeploying logic changes. Values
// are calibrated to FLOSMOSIS: construction labour-hire, the WLES sealed
// clock-on as the core value event, active workers as the metered unit, and AU
// labour-hire licensing as the sharpest ICP signal.
//
// Rationale is inline so the "why" survives. Numbers are deliberate, not round.

/** Australian states/territories with a MANDATORY labour-hire licensing scheme. */
export const MANDATORY_LICENCE_STATES = ['VIC', 'QLD', 'SA', 'ACT'] as const;

/** Pricing tiers (included active workers) — keep in sync with pricing-spec.ts. */
export const TIER_INCLUDED_WORKERS = { starter: 10, growth: 50, scale: 200 } as const;

/** Lead scoring (bot 12). Weights reflect AU construction labour-hire buying reality. */
export const LEAD_SCORING = {
  weights: {
    industryConstructionLabourHire: 28, // exact ICP
    holdsLicenceMandatoryState: 26, // mandatory licence = real compliance pain we solve
    holdsLicenceOtherState: 12,
    workersScaleTier: 16, // >= scale included (200): enterprise economics
    workersGrowthTier: 12, // >= growth included (50)
    workersStarterTier: 6, // >= starter included (10)
    engagedEvidentiaryContent: 14, // read WLES / wage-theft / Fair Work material = high intent
    visitedPricing: 11,
    bookedDemo: 24, // strongest single behavioural signal
    openedEmail: 4,
  },
  // Bands map to a sales action, not round numbers.
  bands: { hot: 62, warm: 34 }, // >= hot -> SDR same-day; >= warm -> nurture; else cold
} as const;

/** Churn-risk (bot 21). Sealed-clock-on recency leads; it is the product's pulse. */
export const CHURN = {
  // Days since last SEALED clock-on — the leading indicator of disengagement.
  // The product is used every working day on site, so a 10+ day gap is high-risk
  // on its own (criticalPoints alone clears the high band).
  sealedClockOn: { criticalDays: 10, criticalPoints: 55, warningDays: 5, warningPoints: 22 },
  activeWorkerDeclinePctThreshold: 18, // metered-unit shrinkage
  activeWorkerDeclinePoints: 24,
  onboardingIncompletePoints: 18, // never reached first seal = fragile account
  failedPaymentPoints: 16,
  supportFrictionTickets: 3,
  supportFrictionPoints: 12,
  bands: { high: 55, medium: 28 },
} as const;

/** Renewal & expansion (bot 17). Expansion = per-active-worker growth (the lever). */
export const RENEWAL = {
  windowDays: 45, // earlier outreach than the generic 30; B2B procurement is slow
  expansionGrowthPctThreshold: 15,
  // A renewal that is imminent AND losing activity is the save priority.
  atRiskActivityDaysThreshold: 7,
} as const;

/** ICP list-building (bot 11). Prioritise mandatory-licence jurisdictions. */
export const ICP = {
  mandatoryStatePriority: 3,
  otherStatePriority: 1,
} as const;

/** Ticket triage (bot 25). Wage/clock-on outages are existential for this product. */
export const TRIAGE = {
  urgentWorkerImpact: 15,
  highWorkerImpact: 4,
} as const;

/** Dunning (bot 37). B2B AU cadence; the workforce SMS channel is a real lever. */
export const DUNNING = {
  // hours, channel, escalate
  ladder: [
    { delayHours: 24, channel: 'email' as const },
    { delayHours: 72, channel: 'email' as const },
    { delayHours: 144, channel: 'email_and_sms' as const },
    { delayHours: 240, channel: 'email_and_sms' as const },
  ],
} as const;

/** NPS (bot 22). Standard classification; bands drive a save/grow play. */
export const NPS = {
  promoterMin: 9,
  passiveMin: 7,
} as const;

/** Contract review (bot 28). Clauses where a deviation is a critical risk. */
export const CONTRACT = {
  criticalClauses: [
    'liability',
    'indemnity',
    'data',
    'privacy',
    'ip',
    'intellectual_property',
    'termination',
  ] as readonly string[],
};

/** Support (bot 23). Confidence calibration for grounded answers. */
export const SUPPORT = {
  // Retrieval similarity at/above which we answer from the KB (T0, grounded).
  minGroundingConfidence: 0.72,
  // Between clarify and min: ask one clarifying question rather than escalate.
  clarifyConfidence: 0.5,
} as const;

/** Knowledge base (bot 24). Chunk quality gate. */
export const KB = {
  // Drop chunks shorter than this (junk/empty) so retrieval stays clean.
  minChunkChars: 20,
} as const;

/** The evidentiary message pillars — FLOSMOSIS's differentiated narrative.
 *  Used by growth/content bots (1, 2, 3, 7, 8) to stay on-message. */
export const MESSAGE_PILLARS = [
  'tamper-evident',
  'wage theft',
  'fair work',
  'sealed',
  'evidence',
  'payroll proof',
  'dispute',
  'labour hire compliance',
] as const;

/** SEO (bot 1). Target topics the product must rank for. */
export const SEO = {
  targetKeywords: [
    'labour hire compliance',
    'wage theft',
    'fair work',
    'timesheet evidence',
    'sealed time records',
    'payroll evidence',
    'labour hire licence',
  ] as readonly string[],
};

/** Competitor & market intel (bot 7) — themes worth surfacing. */
export const INTEL_THEMES = {
  // Regulatory tailwinds are the highest-value signal: wage-theft criminalisation,
  // labour-hire licensing changes, Fair Work / SWA updates move the AU market.
  // No \b anchors: 'labour hire licen' must match 'licence' AND 'licensing'
  // (a trailing \b would fail mid-word). Substring matching is intended here.
  regulatory:
    /(fair work|wage theft|labour hire licen|underpayment|safe work australia|portable long service)/i,
  competitor: /(timesheet|time (clock|tracking)|workforce management|rostering|payroll software)/i,
};

/** Financial reporting (bot 40). Runway alerting a board acts on. */
export const FINANCE = {
  // Months of runway below which the monthly report raises a flag (raise/cut).
  runwayWarningMonths: 6,
  // Gross margin below this for a SaaS business is a red flag worth narrating.
  grossMarginWarningPct: 70,
} as const;
