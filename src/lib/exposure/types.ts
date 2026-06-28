// Labour Hire Exposure Check — type contracts for the externalised rules
// config and the scoring engine. The engine (score.ts) is rule-agnostic: it
// reads a RulesConfig and produces an ExposureResult. Swapping the config
// swaps the law, with no engine changes.
//
// NOTHING in this file asserts a regulatory fact. All facts, thresholds,
// weights and dates live in rules.config.ts as data, each carrying a
// `// REVIEW` tag and a citable source, for founder (admitted solicitor)
// sign-off before launch.

/** The five risk vectors assessed (FLOSTRUCTION Exposure Check §2.2). */
export type VectorId = 'payday_super' | 'licensing' | 'records' | 'fair_work' | 'chain';

/**
 * Result band on the normalised 0–100 exposure scale.
 * `na` = not applicable to this firm (e.g. licensing for an NSW-only operator,
 * which has no scheme to be licensed under — so it is never flagged).
 */
export type Band = 'clear' | 'watch' | 'exposed' | 'na';

/** How a question is answered. `states`/`band` are profiling/gating, not scored. */
export type QuestionKind = 'single' | 'multi' | 'states' | 'band';

/** A citable regulator / legislation reference shown as provenance. */
export interface SourceRef {
  label: string;
  url: string;
}

/**
 * A sourced compliance fact backing a vector's scoring. DRAFT until the
 * founder confirms — `review` is always true here by design.
 */
export interface ComplianceFact {
  id: string;
  statement: string;
  source: SourceRef;
  /** ISO date (YYYY-MM-DD) this statement was verified against the source. */
  verifiedOn?: string;
  /** Always true in this DRAFT ruleset — founder to confirm before launch. */
  review: boolean;
}

/** One selectable answer. `points` is the DRAFT exposure weight (0 = clean). */
export interface Choice {
  value: string;
  label: string;
  /**
   * DRAFT points contributed toward this question's vector.
   * 0 = no exposure signal; higher = more exposure. Calibration is unsigned.
   * // REVIEW: founder to confirm all weights.
   */
  points: number;
  /** Optional plain-English gloss carried into the founder hand-off. */
  note?: string;
}

/** Declarative gate — keeps the engine rule-agnostic (no functions in config). */
export interface AppliesWhen {
  /**
   * Question applies only if at least one selected operating state runs a
   * mandatory labour hire licensing scheme (resolved at runtime from the
   * canonical LICENCE_STATES). This is what prevents an NSW-only firm being
   * asked about — or flagged for — a licence it cannot hold.
   */
  anyOperatingStateHasScheme?: boolean;
}

export interface Question {
  id: string;
  /** Primary vector scored. Omitted for profiling/gating questions. */
  vector?: VectorId;
  kind: QuestionKind;
  /** Sentence-case, trade-literate, asks current state (Mom-Test §2.3). */
  prompt: string;
  help?: string;
  /** Choices for single/multi/band. `states` is populated from LICENCE_STATES. */
  choices?: Choice[];
  /** Multi-select: cap total points so picking many answers can't overflow. */
  multiCap?: number;
  /** Declarative gate; question is skipped (and unscored) when unmet. */
  appliesWhen?: AppliesWhen;
  /** Profiling capture: drives gating + materiality, never scored directly. */
  captures?: 'states' | 'worker_band';
}

export interface VectorBands {
  /** normalised score >= watchAt → at least 'watch'. DRAFT. */
  watchAt: number;
  /** normalised score >= exposedAt → 'exposed'. DRAFT. */
  exposedAt: number;
}

export interface VectorDef {
  id: VectorId;
  /** Display label, e.g. 'Payday Super readiness'. */
  label: string;
  /** One-line, indexable, plain-English description of the vector. */
  blurb: string;
  /** Band thresholds on the 0–100 normalised scale. // REVIEW. */
  bands: VectorBands;
  /**
   * The JOLT low-effort next step shown with a flagged result (§2.4):
   * diagnosis + path, never diagnosis + dread.
   */
  nextStep: string;
  /** The single cited rule this vector hangs on (defensible sourcing §8.6). */
  source: SourceRef;
  /**
   * Whether FLOSTRUCTION's product (verified, sealed hours before payroll)
   * actually closes this gap. Factual, not calibration: records / fair_work /
   * chain / payday_super are product-aligned; licensing is NOT (we don't issue
   * licences). Used as a tie-break so the founder opener leads on a gap the
   * product can solve, at comparable exposure (P4). Does not affect scoring.
   */
  productAligned: boolean;
  /**
   * Founder hand-off opener template used when this vector is the biggest gap.
   * `{states}` is interpolated with the firm's operating state(s).
   */
  opener: string;
  /** Sourced facts justifying the scoring; all REVIEW-tagged. */
  facts: ComplianceFact[];
}

export interface RulesConfig {
  /** Bumped on any change; submissions record the version they scored under. */
  version: string;
  vectors: VectorDef[];
  questions: Question[];
}

// ── Client-safe presentation (no weights) — see questions.ts ─────────────────

/** A selectable answer as the browser sees it: value + label, no points. */
export interface PublicChoice {
  value: string;
  label: string;
}

/** A question as the browser sees it: presentation + gating, no scoring. */
export interface PublicQuestion {
  id: string;
  vector?: VectorId;
  kind: QuestionKind;
  prompt: string;
  help?: string;
  choices?: PublicChoice[];
  appliesWhen?: AppliesWhen;
  captures?: 'states' | 'worker_band';
}

// ── Engine I/O ──────────────────────────────────────────────────────────────

/** Raw answers keyed by question id. Single → string; multi/states → string[]. */
export type Answers = Record<string, string | string[] | undefined>;

export interface VectorResult {
  vector: VectorId;
  label: string;
  /** One-line plain-English description (so the client needn't import config). */
  blurb: string;
  band: Band;
  /** Normalised 0–100 exposure for this vector (0 when na). */
  score: number;
  applicable: boolean;
  /** Paired low-effort next step (only meaningful when not clear/na). */
  nextStep: string;
  source: SourceRef;
}

export interface ExposureResult {
  /** Ruleset version that produced this result (auditability). */
  version: string;
  vectors: VectorResult[];
  /** Highest-exposure applicable vector that is at least 'watch'; else null. */
  biggestGap: VectorId | null;
  /** Operating state slugs (from the profiling question). */
  states: string[];
  /** Worker-band value (materiality / pricing tier), or null. */
  workerBand: string | null;
  /** Worst band across applicable vectors — the headline. */
  overall: Band;
  /**
   * Founder-only hand-off line (§2.5). Built from the biggest gap + states.
   * Never shown to the end user; surfaced to the founder on lead capture.
   */
  founderOpener: string;
}

/** What the browser receives — the result minus the internal founder opener. */
export type PublicExposureResult = Omit<ExposureResult, 'founderOpener'>;
