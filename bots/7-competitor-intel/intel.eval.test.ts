// Golden evals — bot 7 (competitor & market intel). Dedupe + recency.

import { describe, it, expect } from 'vitest';
import { normaliseUrl, curateSources, type Source } from './handler';

const DAY = 86_400_000;
const now = 1_000 * DAY;

describe('bot 7 — competitor intel', () => {
  it('normalises URLs for dedupe', () => {
    expect(normaliseUrl('https://Example.com/a/')).toBe('example.com/a');
    expect(normaliseUrl('http://example.com/a?ref=x#y')).toBe('example.com/a');
  });

  it('dedupes by normalised URL keeping the most recent, newest first', () => {
    const sources: Source[] = [
      { url: 'https://x.com/a', title: 'old', publishedMs: now - 5 * DAY },
      { url: 'http://x.com/a/', title: 'new', publishedMs: now - 1 * DAY },
      { url: 'https://y.com/b', title: 'y', publishedMs: now - 2 * DAY },
    ];
    const out = curateSources(sources, now, 30 * DAY);
    expect(out).toHaveLength(2);
    expect(out[0]?.title).toBe('new'); // newest first, deduped
  });

  it('drops sources older than the max age', () => {
    const out = curateSources(
      [{ url: 'https://z.com', title: 'stale', publishedMs: now - 60 * DAY }],
      now,
      30 * DAY,
    );
    expect(out).toEqual([]);
  });
});
