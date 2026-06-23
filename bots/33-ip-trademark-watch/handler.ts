// Bot 33 — IP & trademark watch.
//
// Trigger: weekly | Runtime: pg_cron->EF | Gate: T1 | Model: Haiku (triage).
// Monitors registers for marks similar to ours; flags relevant hits with the
// source. The similarity screen is deterministic; Haiku triages borderline hits.

export const BOT_ID = 'bot-33-ip-trademark-watch';

// Marks we watch for collisions.
export const WATCHED_MARKS = ['flosmosis', 'flostruction', 'wles'] as const;

export interface RegisterHit {
  mark: string;
  applicant: string;
  sourceUrl: string;
}

export interface FlaggedHit extends RegisterHit {
  collidesWith: string;
  similarity: number; // 0-1
}

/** Normalised token for comparison: lowercased, alphanumeric only. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Character-level Sørensen–Dice bigram similarity (0-1). Deterministic and
 * dependency-free; good enough to screen near-identical brand marks.
 */
export function similarity(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const bx = bigrams(x);
  const by = bigrams(y);
  let overlap = 0;
  for (const [g, c] of bx) overlap += Math.min(c, by.get(g) ?? 0);
  return (2 * overlap) / (x.length - 1 + (y.length - 1));
}

/** Pure: flag hits similar (>= threshold) to any watched mark, strongest first. */
export function flagHits(hits: ReadonlyArray<RegisterHit>, threshold = 0.6): FlaggedHit[] {
  const flagged: FlaggedHit[] = [];
  for (const h of hits) {
    let best = { mark: '', sim: 0 };
    for (const w of WATCHED_MARKS) {
      const sim = similarity(h.mark, w);
      if (sim > best.sim) best = { mark: w, sim };
    }
    if (best.sim >= threshold) {
      flagged.push({ ...h, collidesWith: best.mark, similarity: best.sim });
    }
  }
  return flagged.sort((a, b) => b.similarity - a.similarity);
}
