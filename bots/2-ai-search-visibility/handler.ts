// Bot 2 — AI-search visibility.
//
// Trigger: weekly | Runtime: pg_cron->EF | Gate: T1 | Model: Haiku/Sonnet
// (detect presence). For each target prompt we query answer engines; the
// presence scoring and week-over-week delta are deterministic. The LLM only
// judges whether a brand mention is present in a given answer (off this path).

export const BOT_ID = 'bot-2-ai-search-visibility';

export interface PromptResult {
  prompt: string;
  /** Whether FLOSMOSIS/FLOSTRUCTION was present in each engine's answer. */
  enginePresence: Record<string, boolean>;
}

export interface PresenceScore {
  prompt: string;
  /** Share of engines that mentioned the brand, 0-1. */
  score: number;
  enginesMentioning: number;
  enginesTotal: number;
}

/** Pure: presence score for one prompt (share of engines mentioning the brand). */
export function presenceScore(r: PromptResult): PresenceScore {
  const engines = Object.values(r.enginePresence);
  const mentioning = engines.filter(Boolean).length;
  const total = engines.length;
  return {
    prompt: r.prompt,
    score: total > 0 ? mentioning / total : 0,
    enginesMentioning: mentioning,
    enginesTotal: total,
  };
}

export interface PresenceDelta extends PresenceScore {
  /** Change in score vs the previous run (positive = improving). */
  delta: number;
}

/** Pure: per-prompt score plus delta against the previous run's scores. */
export function scoreWithDelta(
  current: ReadonlyArray<PromptResult>,
  previous: ReadonlyMap<string, number>,
): PresenceDelta[] {
  return current.map((r) => {
    const s = presenceScore(r);
    const prev = previous.get(r.prompt) ?? 0;
    return { ...s, delta: s.score - prev };
  });
}
