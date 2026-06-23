// guard.ts — deterministic compliance guards. NEVER an LLM.
//
// These functions are the structural enforcement behind HARD CONSTRAINTS 4
// (Australian compliance) and 6 (output hygiene). They throw a typed
// GuardError when a check fails; callers must let it propagate so a
// non-compliant side-effect becomes impossible rather than merely discouraged.
//
// Backs bot 30 (compliance guard) and bot 6's deterministic emoji block.

import { env } from './env';

export class GuardError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'GuardError';
    this.code = code;
  }
}

/**
 * Matches emoji and pictographic symbols. Uses Unicode property escapes
 * (requires a modern JS engine — Node 18+ / Deno, both fine). Covers
 * Extended_Pictographic plus regional indicators (flags) and the emoji
 * variation selector. ASCII text, accented Latin, and punctuation pass.
 */
const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{20E3}]/u;

/** True if the string contains any emoji / pictographic character. */
export function containsEmoji(text: string): boolean {
  return EMOJI_RE.test(text);
}

/**
 * Output hygiene (HARD CONSTRAINT 6): no emoji in any output, file, message,
 * or UI. Throws GuardError('EMOJI') if any emoji is present.
 */
export function assertNoEmoji(text: string, context = 'output'): void {
  if (containsEmoji(text)) {
    throw new GuardError('EMOJI', `Emoji not permitted in ${context}.`);
  }
}

export interface OutboundEmail {
  to: string;
  subject: string;
  body: string;
}

/**
 * Normalise an ABN for comparison: strip spaces so "12 345 678 901" matches
 * "12345678901". Australian ABNs are 11 digits.
 */
function normaliseAbn(s: string): string {
  return s.replace(/\s+/g, '');
}

/**
 * Spam Act 2003 (HARD CONSTRAINT 4): any outbound email is structurally
 * blocked unless it carries the FLOSMOSIS ABN and a functional unsubscribe.
 * Also enforces no-emoji on subject and body (output hygiene).
 *
 * Configuration comes from env (FLOSMOSIS_ABN, FLOSMOSIS_UNSUBSCRIBE_BASE_URL)
 * so the real ABN never lives in source. If the ABN is not configured the
 * guard fails closed — a send cannot proceed without the required identifier.
 */
export function assertSpamActCompliant(email: OutboundEmail): void {
  assertNoEmoji(email.subject, 'email subject');
  assertNoEmoji(email.body, 'email body');

  const abn = env('FLOSMOSIS_ABN');
  if (!abn) {
    throw new GuardError(
      'ABN_NOT_CONFIGURED',
      'FLOSMOSIS_ABN is not configured; outbound email blocked (fail closed).',
    );
  }
  const bodyAbn = normaliseAbn(email.body);
  if (!bodyAbn.includes(normaliseAbn(abn))) {
    throw new GuardError(
      'ABN_MISSING',
      'Outbound email must include the FLOSMOSIS ABN (Spam Act 2003).',
    );
  }

  // Functional unsubscribe: either the configured unsubscribe base URL, or a
  // recognisable unsubscribe link/mailto. We require an actionable mechanism,
  // not merely the word "unsubscribe".
  const unsubBase = env('FLOSMOSIS_UNSUBSCRIBE_BASE_URL');
  const hasConfiguredLink = unsubBase ? email.body.includes(unsubBase) : false;
  const hasUnsubLink =
    /https?:\/\/\S*unsub\S*/i.test(email.body) ||
    /mailto:\S+\?subject=unsubscribe/i.test(email.body);
  if (!hasConfiguredLink && !hasUnsubLink) {
    throw new GuardError(
      'UNSUBSCRIBE_MISSING',
      'Outbound email must include a functional unsubscribe link (Spam Act 2003).',
    );
  }
}

/**
 * Self-grounding (HARD CONSTRAINT 8): an answer drafted for customer/legal/
 * payroll surfaces must be grounded in retrieved source, not free recall.
 * Deterministic check: there must be at least one source, and every cited
 * source id used in the answer must exist in the provided source set.
 *
 * `citedIds` are the source identifiers the generator claims to have used
 * (extracted structurally from its JSON output, never inferred by an LLM here).
 */
export function assertGrounded(opts: {
  sources: ReadonlyArray<{ id: string }>;
  citedIds: ReadonlyArray<string>;
}): void {
  if (opts.sources.length === 0) {
    throw new GuardError('NO_SOURCES', 'Grounded answer requires at least one retrieved source.');
  }
  if (opts.citedIds.length === 0) {
    throw new GuardError('NO_CITATIONS', 'Grounded answer must cite at least one source.');
  }
  const known = new Set(opts.sources.map((s) => s.id));
  for (const id of opts.citedIds) {
    if (!known.has(id)) {
      throw new GuardError(
        'CITATION_NOT_IN_SOURCES',
        `Answer cited source "${id}" not present in retrieved sources (possible hallucination).`,
      );
    }
  }
}
