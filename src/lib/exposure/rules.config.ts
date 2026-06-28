// ─────────────────────────────────────────────────────────────────────────────
// Labour Hire Exposure Check — RULES CONFIG (the compliance brain).
//
// SINGLE SOURCE OF TRUTH for all compliance logic. Every threshold, date,
// dollar figure, state-scheme flag, weighting and scoring band lives here as
// DATA, not logic. The engine (score.ts) is otherwise rule-agnostic.
//
// SERVER-ONLY: this module carries the scoring WEIGHTS and compliance facts.
// It imports the question PRESENTATION from questions.ts (client-safe) and
// attaches weights, so the rule set is never shipped to the browser (§3).
//
// ⚠️  DRAFT — NOT YET SIGNED OFF. Every regulatory value below carries a
//     `// REVIEW:` tag and a citable source. The founder (Lauren de Mestre,
//     admitted solicitor of the Supreme Court of NSW) must verify and sign
//     off EVERY value before launch. Nothing here may be presented in the UI
//     as authoritative. The scoring WEIGHTS (`points`, band thresholds) are
//     product calibration, also DRAFT, and likewise unsigned.
//
//     ▶ Sign-off checklist (one pass over every value):
//       legal-review/exposure-check-sign-off.md
//     On sign-off: bump EXPOSURE_RULESET_VERSION (questions.ts) draft → r,
//     and remove the `preview` prop on <ExposureCheck> in the page.
//
// Sourcing: facts were drafted from the FLOSMOSIS content cluster and
// cross-checked against the live regulator/ATO/Fair Work sources cited on
// 2026-06-28. State licensing facts REUSE the canonical LICENCE_STATES data
// (src/lib/seo/labour-hire-licence.ts) — they are not duplicated here.
//
// Versioning: bump EXPOSURE_RULESET_VERSION (questions.ts) on ANY change.
// Submissions record the version they were scored under so that when the law
// changes we always know which ruleset a given result used.
// ─────────────────────────────────────────────────────────────────────────────

import type { Choice, Question, RulesConfig, VectorDef } from './types';
import { PUBLIC_QUESTIONS, EXPOSURE_RULESET_VERSION } from './questions';

/**
 * Ruleset version. Format: <ISO date>-<channel>.<n>.
 * `draft` channel = NOT founder-signed. Promote to `r` (released) on sign-off.
 * Single source of truth is questions.ts (also used client-side).
 */
export const RULESET_VERSION = EXPOSURE_RULESET_VERSION;

// ── Canonical sources (cited as provenance on flagged vectors) ───────────────

const SRC_ATO_PAYDAY = {
  label: 'Australian Taxation Office — Payday Super',
  url: 'https://www.ato.gov.au/businesses-and-organisations/super-for-employers/payday-super',
};
const SRC_ATO_SGC = {
  label: 'Australian Taxation Office — The super guarantee charge',
  url: 'https://www.ato.gov.au/businesses-and-organisations/super-for-employers/paying-super-contributions/missing-and-late-super-guarantee-payments/the-super-guarantee-charge',
};
const SRC_FWO_PAYDAY = {
  label: 'Fair Work Ombudsman — Payday Super: new rules starting 1 July 2026',
  url: 'https://www.fairwork.gov.au/newsroom/news/payday-super-new-rules-starting-1-july-2026',
};
const SRC_FWO_RECORDS = {
  label: 'Fair Work Ombudsman — Record-keeping for employers',
  url: 'https://www.fairwork.gov.au/pay-and-wages/pay-records',
};
const SRC_LHL_QLD = {
  label: 'Labour Hire Licensing Queensland — About the licensing scheme',
  url: 'https://www.labourhire.qld.gov.au/about-licensing-scheme',
};
const SRC_FWO_LABOUR_HIRE = {
  label: 'Fair Work Ombudsman — Labour hire and supply chains',
  url: 'https://www.fairwork.gov.au/find-help-for/labour-hire-and-supply-chains',
};

// ─────────────────────────────────────────────────────────────────────────────
// VECTORS — definition, band thresholds, paired next step, source, opener,
// and the sourced facts that justify the scoring.
// ─────────────────────────────────────────────────────────────────────────────

const VECTORS: VectorDef[] = [
  {
    id: 'payday_super',
    label: 'Payday Super readiness',
    blurb:
      'From 1 July 2026, super must be paid every pay run and received by the fund within 7 business days — and unpaid super can reach a director personally.',
    // REVIEW: founder to confirm band thresholds (product calibration, unsigned).
    bands: { watchAt: 30, exposedAt: 65 },
    nextStep:
      'Map one pay run end to end: confirm your clearing house can land super in the fund within 7 business days, and that the hours feeding the run are locked before it goes.',
    source: SRC_ATO_PAYDAY,
    opener:
      'You flagged that super still goes out monthly or quarterly with {states} payroll running weekly — from 1 July 2026 that is a per-run obligation with director liability attached. Want to see what a defensible, locked-before-payroll record looks like?',
    facts: [
      {
        id: 'payday-commencement',
        statement:
          'Payday Super commences 1 July 2026: employers must pay super guarantee for each payday rather than quarterly.',
        source: SRC_FWO_PAYDAY,
        verifiedOn: '2026-06-28',
        review: true, // REVIEW: founder to confirm commencement date + that no phase-in applies.
      },
      {
        id: 'payday-7-business-days',
        statement:
          "Contributions must be RECEIVED by the employee's fund within 7 business days of payday (the QE day), not merely sent.",
        source: SRC_ATO_PAYDAY,
        verifiedOn: '2026-06-28',
        review: true, // REVIEW: founder to confirm the 7-business-day receipt rule and any exceptions.
      },
      {
        id: 'payday-new-employee-20-days',
        statement:
          "A new employee's first super contribution is due within 20 business days of the first salary/wages payment.",
        source: SRC_ATO_PAYDAY,
        verifiedOn: '2026-06-28',
        review: true, // REVIEW: founder to confirm the 20-business-day new-employee window.
      },
      {
        id: 'sgc-director-liability',
        statement:
          'Late or unpaid super triggers the Super Guarantee Charge (not tax deductible), and Director Penalty Notices can make directors personally liable.',
        source: SRC_ATO_SGC,
        verifiedOn: '2026-06-28',
        review: true, // REVIEW: founder to confirm SGC consequences + DPN personal-liability wording; confirm current penalty figures before quoting any percentage.
      },
      {
        id: 'sg-rate-12pc',
        statement:
          'The super guarantee rate is 12% of qualifying earnings from 1 July 2025 (final legislated increase).',
        source: SRC_ATO_PAYDAY,
        verifiedOn: '2026-06-28',
        review: true, // REVIEW: founder to confirm the 12% rate and the qualifying-earnings (QE) base vs OTE.
      },
    ],
  },
  {
    id: 'licensing',
    label: 'Labour hire licensing',
    blurb:
      'QLD, VIC, SA and the ACT run mandatory labour hire licensing schemes; NSW, WA, TAS and the NT do not. The obligation follows where the work is supplied.',
    // REVIEW: founder to confirm band thresholds.
    bands: { watchAt: 40, exposedAt: 70 },
    nextStep:
      'Confirm a current licence in each scheme state you supply into (QLD, VIC, SA, ACT) — including any cross-border supply from a no-scheme base — before your next placement.',
    source: SRC_LHL_QLD,
    opener:
      'You supply into {states}, which runs a mandatory licensing scheme, and the licence position was unclear — that is exactly the gap that stops a placement cold. Want a hand confirming the cross-border picture?',
    facts: [
      {
        id: 'licensing-scheme-states',
        statement:
          'Four jurisdictions operate a mandatory labour hire licensing scheme — QLD, VIC, SA and the ACT. NSW, WA, TAS and the NT do not. (Canonical: LICENCE_STATES.)',
        source: SRC_FWO_LABOUR_HIRE,
        verifiedOn: '2026-06-25', // matches LICENCE_STATES verification date
        review: true, // REVIEW: founder to confirm — but note this REUSES the already-verified LICENCE_STATES data.
      },
      {
        id: 'licensing-cross-border',
        statement:
          'The obligation follows where workers are SUPPLIED, not where the business is based: a provider in a no-scheme state must hold the destination state’s licence to supply there.',
        source: SRC_LHL_QLD,
        verifiedOn: '2026-06-25',
        review: true, // REVIEW: founder to confirm cross-border obligation wording (reuses LICENCE_STATES.crossBorder).
      },
      {
        id: 'licensing-nsw-no-scheme',
        statement:
          'NSW has no dedicated labour hire licensing scheme; an NSW-only operator cannot be flagged for a licence it cannot hold. (Engine marks licensing N/A unless a scheme state is selected.)',
        source: SRC_FWO_LABOUR_HIRE,
        verifiedOn: '2026-06-25',
        review: true, // REVIEW: founder to confirm NSW position; this is enforced in score.ts, not just stated.
      },
    ],
  },
  {
    id: 'records',
    label: 'Records & evidence',
    blurb:
      'Whether your worked-hour records would survive a disputed pay claim. This is the core wedge — scored prominently, but honestly.',
    // REVIEW: founder to confirm band thresholds.
    bands: { watchAt: 25, exposedAt: 55 },
    nextStep:
      'Pick one site and capture this week’s hours at the point of work with a supervisor sign-off, so there is a record that settles a dispute in seconds rather than an argument.',
    source: SRC_FWO_RECORDS,
    opener:
      'You told us hours are still captured on {recordsMethod} across {states} — that is the record that fails first in a pay dispute. Want me to show you what a defensible, supervisor-approved record looks like?',
    facts: [
      {
        id: 'records-retention-7y',
        statement:
          'Employers must keep time-and-wages records for 7 years; they must be legible, in English, and not altered except to correct a genuine error.',
        source: SRC_FWO_RECORDS,
        verifiedOn: '2026-06-28',
        review: true, // REVIEW: founder to confirm 7-year retention + the legibility/alteration conditions.
      },
      {
        id: 'records-burden-557c',
        statement:
          'Under s 557C of the Fair Work Act, if a required record is not kept, the employer carries the burden of disproving an underpayment claim.',
        source: SRC_FWO_RECORDS,
        verifiedOn: '2026-06-28',
        review: true, // REVIEW: founder (solicitor) to confirm the s 557C reverse-onus characterisation and its exact scope.
      },
    ],
  },
  {
    id: 'fair_work',
    label: 'Wage-claim & Fair Work exposure',
    blurb:
      'Dispute history and record-keeping obligations that drive underpayment risk and Fair Work exposure.',
    // REVIEW: founder to confirm band thresholds.
    bands: { watchAt: 35, exposedAt: 70 },
    nextStep:
      'Make supervisor approval the gate every shift passes before payroll, so a disputed hour is settled by a record on file, not reconstructed from memory.',
    source: SRC_FWO_RECORDS,
    opener:
      'A recent pay dispute plus records that may not hold up is the combination that turns into a Fair Work claim. Want a short walkthrough of how verified hours close that gap?',
    facts: [
      {
        id: 'fw-record-keeping-obligation',
        statement:
          'Fair Work requires accurate records of hours worked (where pay varies with hours), pay, and superannuation; failure can attract penalties and shifts the evidentiary position.',
        source: SRC_FWO_RECORDS,
        verifiedOn: '2026-06-28',
        review: true, // REVIEW: founder to confirm record-keeping obligation summary; confirm current penalty exposure before quoting figures.
      },
    ],
  },
  {
    id: 'chain',
    label: 'Chain-of-responsibility',
    blurb:
      'Exposure carried up the chain through head-contractor and principal relationships in construction supply chains.',
    // REVIEW: founder to confirm band thresholds.
    bands: { watchAt: 50, exposedAt: 80 },
    nextStep:
      'For each head contractor you place under, hold a clean, exportable record per worker per site — the evidence a principal will ask for first when a claim lands up the chain.',
    source: SRC_FWO_LABOUR_HIRE,
    opener:
      'Placing workers under head contractors means a claim can travel up the chain to you — defensible per-site records are what contain it. Want to see how that export looks?',
    facts: [
      {
        id: 'chain-supply-chain-risk',
        statement:
          'In labour hire supply chains, accountability for worker entitlements can extend beyond the direct employer to others in the chain; defensible records contain that exposure.',
        source: SRC_FWO_LABOUR_HIRE,
        verifiedOn: '2026-06-28',
        review: true, // REVIEW: founder to confirm how far chain-of-responsibility / accessorial liability extends and how to frame it without overstating.
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SCORING WEIGHTS — server-only. Keyed by question id → choice value. Higher
// points = more exposure (0 = clean). Merged onto the client-safe presentation
// (questions.ts) to build the full Question[] the engine scores. `note` is the
// plain-English gloss carried into the founder hand-off opener.
// All values DRAFT. // REVIEW: founder to confirm every weight.
// ─────────────────────────────────────────────────────────────────────────────

interface Weight {
  points: number;
  note?: string;
}

const WEIGHTS: Record<string, Record<string, Weight>> = {
  records_method: {
    nothing: { points: 10, note: 'no records' },
    memory: { points: 10, note: 'reconstructed from memory' },
    paper: { points: 8, note: 'paper timesheets' },
    spreadsheet: { points: 6, note: 'a spreadsheet' },
    rostering: { points: 3, note: 'a rostering app' },
    biometric: { points: 1, note: 'a sign-on device' },
  },
  records_survive: {
    no: { points: 10 },
    unsure: { points: 6 },
    yes: { points: 1 },
  },
  dispute_history: {
    recent: { points: 8 },
    once: { points: 4 },
    none: { points: 0 },
  },
  licence_held: {
    no: { points: 10 },
    unsure: { points: 7 },
    applying: { points: 4 },
    yes: { points: 0 },
  },
  super_cadence: {
    quarterly: { points: 10 },
    monthly: { points: 6 },
    each_run: { points: 0 },
    unsure: { points: 7 },
  },
  director_aware: {
    no: { points: 6 },
    somewhat: { points: 3 },
    yes: { points: 0 },
  },
  head_contractors: {
    multiple: { points: 6 },
    one: { points: 4 },
    no: { points: 0 },
  },
};

/** Merge presentation (questions.ts) + weights into the full scored questions. */
function buildQuestions(): Question[] {
  return PUBLIC_QUESTIONS.map((q) => {
    const { choices: pub, ...rest } = q;
    const w = WEIGHTS[q.id];
    if (!pub) return { ...rest };
    const choices: Choice[] = pub.map((c) => {
      const weight = w?.[c.value];
      return weight?.note
        ? { value: c.value, label: c.label, points: weight.points, note: weight.note }
        : { value: c.value, label: c.label, points: weight?.points ?? 0 };
    });
    return { ...rest, choices };
  });
}

export const RULES: RulesConfig = {
  version: RULESET_VERSION,
  vectors: VECTORS,
  questions: buildQuestions(),
};

export default RULES;
