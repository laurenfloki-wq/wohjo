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

export interface CoverageGap extends PresenceDelta {
  /** Why flagged: absent entirely, weakly present, or declining vs last run. */
  reason: 'absent' | 'weak' | 'declining';
}

/**
 * Pure: the prompts worth acting on — brand absent, weakly present (< half the
 * engines), or losing ground vs last run. Worst first. This is the content/PR
 * work list, not a vanity score.
 */
export function coverageGaps(scored: ReadonlyArray<PresenceDelta>): CoverageGap[] {
  return scored
    .filter((s) => s.score < 0.5 || s.delta < 0)
    .map((s) => ({
      ...s,
      reason:
        s.score === 0
          ? ('absent' as const)
          : s.delta < 0
            ? ('declining' as const)
            : ('weak' as const),
    }))
    .sort((a, b) => a.score - b.score || a.delta - b.delta);
}
