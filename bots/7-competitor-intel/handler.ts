// Bot 7 — Competitor & market intel.
//
// Trigger: weekly | Runtime: pg_cron->EF | Gate: T1 | Model: Haiku/Sonnet
// (extract + brief). Gathers from HTTP/search + regulator feeds, then briefs.
// The dedupe + recency filtering of gathered sources is deterministic so the
// brief is grounded in distinct, recent sources (never duplicated or stale).

export const BOT_ID = 'bot-7-competitor-intel';

export interface Source {
  url: string;
  title: string;
  publishedMs: number;
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
