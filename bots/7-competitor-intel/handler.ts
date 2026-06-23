// Bot 7 — Competitor & market intel.
//
// Trigger: weekly | Runtime: pg_cron->EF | Gate: T1 | Model: Haiku/Sonnet
// (extract + brief). Gathers from HTTP/search + regulator feeds, then briefs.
// The dedupe + recency filtering of gathered sources is deterministic so the
// brief is grounded in distinct, recent sources (never duplicated or stale).

import { INTEL_THEMES } from '../config';

export const BOT_ID = 'bot-7-competitor-intel';

export interface Source {
  url: string;
  title: string;
  publishedMs: number;
}

export type IntelTheme = 'regulatory' | 'competitor' | 'market';

export interface ThemedSource extends Source {
  theme: IntelTheme;
  /** Regulatory tailwinds (wage-theft law, licensing) are the highest-value signal. */
  priority: number;
}

/** Pure: classify a source by theme from its title. */
export function classifyTheme(title: string): IntelTheme {
  if (INTEL_THEMES.regulatory.test(title)) return 'regulatory';
  if (INTEL_THEMES.competitor.test(title)) return 'competitor';
  return 'market';
}

/** Normalise a URL for dedupe: drop protocol, trailing slash, and query/hash. */
export function normaliseUrl(url: string): string {
  return url
    .replace(/^https?:\/\//i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

/**
 * Pure: dedupe by normalised URL (keep the most recent), drop sources older than
 * `maxAgeMs` relative to `nowMs`, and return newest first.
 */
export function curateSources(
  sources: ReadonlyArray<Source>,
  nowMs: number,
  maxAgeMs: number,
): Source[] {
  const byUrl = new Map<string, Source>();
  for (const s of sources) {
    if (nowMs - s.publishedMs > maxAgeMs) continue;
    const key = normaliseUrl(s.url);
    const cur = byUrl.get(key);
    if (!cur || s.publishedMs > cur.publishedMs) byUrl.set(key, s);
  }
  return [...byUrl.values()].sort((a, b) => b.publishedMs - a.publishedMs);
}

const THEME_PRIORITY: Record<IntelTheme, number> = { regulatory: 3, competitor: 2, market: 1 };

/**
 * Pure: curate, then classify by theme and order for the brief — regulatory
 * tailwinds first (a wage-theft-criminalisation or licensing change is a market
 * mover for FLOSMOSIS), then competitor moves, then general market, recency as
 * the tiebreak.
 */
export function themedBrief(
  sources: ReadonlyArray<Source>,
  nowMs: number,
  maxAgeMs: number,
): ThemedSource[] {
  return curateSources(sources, nowMs, maxAgeMs)
    .map((s) => {
      const theme = classifyTheme(s.title);
      return { ...s, theme, priority: THEME_PRIORITY[theme] };
    })
    .sort((a, b) => b.priority - a.priority || b.publishedMs - a.publishedMs);
}
