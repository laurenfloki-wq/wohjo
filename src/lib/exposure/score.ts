// Labour Hire Exposure Check — scoring engine.
//
// Rule-agnostic by design: it reads a RulesConfig and produces an
// ExposureResult. It hardcodes NO legal threshold — every weight, band and
// fact comes from rules.config.ts. The only domain knowledge it holds is the
// engine MECHANICS (sum → normalise → band → biggest gap → opener).
//
// Runs server-side in production (so the rule set isn't exposed client-side
// and can't be trivially gamed), but is a pure function with no I/O, so it is
// equally usable in a client preview and in unit tests.

import type {
  Answers,
  Band,
  ExposureResult,
  RulesConfig,
  VectorId,
  VectorResult,
} from './types';
import { RULES } from './rules.config';
import { LICENCE_STATES } from '@/lib/seo/labour-hire-licence';

/** Slugs of states that run a mandatory scheme — derived from canonical data. */
const SCHEME_STATE_SLUGS = new Set(
  LICENCE_STATES.filter((s) => s.hasScheme).map((s) => s.slug),
);

function asArray(v: Answers[string]): string[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.length > 0) return [v];
  return [];
}

/** Does the firm supply into at least one scheme jurisdiction? */
export function operatesInSchemeState(stateSlugs: string[]): boolean {
  return stateSlugs.some((slug) => SCHEME_STATE_SLUGS.has(slug));
}

function bandFor(score: number, watchAt: number, exposedAt: number): Band {
  if (score >= exposedAt) return 'exposed';
  if (score >= watchAt) return 'watch';
  return 'clear';
}

const WORST_FIRST: Band[] = ['exposed', 'watch', 'clear', 'na'];
function worstBand(bands: Band[]): Band {
  for (const b of WORST_FIRST) if (bands.includes(b)) return b;
  return 'clear';
}

/**
 * Score a set of answers into a per-vector exposure profile.
 *
 * @param answers Raw answers keyed by question id.
 * @param config  The (versioned) ruleset. Defaults to the current RULES.
 */
export function scoreExposure(answers: Answers, config: RulesConfig = RULES): ExposureResult {
  // Profiling inputs first — they gate which rules apply.
  const statesQ = config.questions.find((q) => q.captures === 'states');
  const workerQ = config.questions.find((q) => q.captures === 'worker_band');
  const states = statesQ ? asArray(answers[statesQ.id]) : [];
  const workerBand =
    workerQ && typeof answers[workerQ.id] === 'string' ? (answers[workerQ.id] as string) : null;
  const hasSchemeState = operatesInSchemeState(states);

  const vectorResults: VectorResult[] = config.vectors.map((vector) => {
    // Questions that score into this vector AND currently apply.
    const questions = config.questions.filter((q) => {
      if (q.vector !== vector.id || !q.choices) return false;
      if (q.appliesWhen?.anyOperatingStateHasScheme && !hasSchemeState) return false;
      return true;
    });

    // A vector is N/A if it has no applicable scored questions (e.g. licensing
    // for an NSW-only operator — it can never be flagged for an absent scheme).
    if (questions.length === 0) {
      return {
        vector: vector.id,
        label: vector.label,
        blurb: vector.blurb,
        band: 'na',
        score: 0,
        applicable: false,
        nextStep: vector.nextStep,
        source: vector.source,
      };
    }

    let earned = 0;
    let max = 0;
    for (const q of questions) {
      const choices = q.choices!;
      const selected = asArray(answers[q.id]);
      if (q.kind === 'multi') {
        const cap = q.multiCap ?? choices.reduce((a, c) => a + c.points, 0);
        max += cap;
        const sum = choices
          .filter((c) => selected.includes(c.value))
          .reduce((a, c) => a + c.points, 0);
        earned += Math.min(sum, cap);
      } else {
        // single / band — highest available points is the question's max.
        max += Math.max(0, ...choices.map((c) => c.points));
        const chosen = choices.find((c) => c.value === selected[0]);
        earned += chosen ? chosen.points : 0;
      }
    }

    const score = max > 0 ? Math.round((earned / max) * 100) : 0;
    return {
      vector: vector.id,
      label: vector.label,
      blurb: vector.blurb,
      band: bandFor(score, vector.bands.watchAt, vector.bands.exposedAt),
      score,
      applicable: true,
      nextStep: vector.nextStep,
      source: vector.source,
    };
  });

  // Biggest gap = highest-scoring applicable flagged vector — but the HAND-OFF
  // should lead on a gap the PRODUCT can close (P4). So if the top gap is a
  // non-product-aligned vector (licensing), and a product-aligned gap sits at
  // the same or worse band severity (comparable exposure), lead with that one
  // instead. Licensing stays a real flag in the result; it just doesn't lead
  // the human conversation. Exposure scoring itself is unchanged.
  const sevRank: Record<Band, number> = { exposed: 3, watch: 2, clear: 1, na: 0 };
  const aligned = new Map(config.vectors.map((v) => [v.id, v.productAligned]));
  const flagged = vectorResults
    .filter((v) => v.applicable && (v.band === 'watch' || v.band === 'exposed'))
    .sort((a, b) => b.score - a.score);
  let lead = flagged[0] ?? null;
  if (lead && !aligned.get(lead.vector)) {
    const alt = flagged.find(
      (v) => aligned.get(v.vector) && sevRank[v.band] >= sevRank[lead!.band],
    );
    if (alt) lead = alt;
  }
  const biggestGap = lead ? lead.vector : null;

  const overall = worstBand(vectorResults.filter((v) => v.applicable).map((v) => v.band));

  return {
    version: config.version,
    vectors: vectorResults,
    biggestGap,
    states,
    workerBand,
    overall,
    founderOpener: buildFounderOpener(biggestGap, states, answers, config),
  };
}

/** Full state names from slugs, for human-readable hand-off copy. */
function stateNames(slugs: string[]): string {
  const names = slugs
    .map((slug) => LICENCE_STATES.find((s) => s.slug === slug)?.abbr)
    .filter((x): x is string => Boolean(x));
  if (names.length === 0) return 'your state';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Build the founder hand-off opener (§2.5) from the biggest gap's template.
 * Interpolates {states} and, for the records vector, {recordsMethod}.
 */
export function buildFounderOpener(
  biggestGap: VectorId | null,
  states: string[],
  answers: Answers,
  config: RulesConfig,
): string {
  if (!biggestGap) {
    return 'No elevated exposure flagged. Worth a short call to confirm records hold up before 1 July 2026.';
  }
  const vector = config.vectors.find((v) => v.id === biggestGap);
  if (!vector) return '';
  const recordsQ = config.questions.find((q) => q.id === 'records_method');
  const recordsChoice = recordsQ?.choices?.find(
    (c) => c.value === (typeof answers['records_method'] === 'string' ? answers['records_method'] : ''),
  );
  return vector.opener
    .replaceAll('{states}', stateNames(states))
    .replaceAll('{recordsMethod}', recordsChoice?.note ?? 'how hours are captured now');
}
