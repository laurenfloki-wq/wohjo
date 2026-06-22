// Golden evals — bot 2 (AI-search visibility). Deterministic presence + delta.

import { describe, it, expect } from 'vitest';
import { presenceScore, scoreWithDelta } from './handler';

describe('bot 2 — AI-search visibility', () => {
  it('scores presence as share of engines mentioning the brand', () => {
    const s = presenceScore({
      prompt: 'best labour-hire time verification',
      enginePresence: { perplexity: true, chatgpt: false, gemini: true, claude: true },
    });
    expect(s.enginesMentioning).toBe(3);
    expect(s.enginesTotal).toBe(4);
    expect(s.score).toBeCloseTo(0.75, 6);
  });

  it('computes week-over-week delta', () => {
    const out = scoreWithDelta(
      [{ prompt: 'p1', enginePresence: { a: true, b: true } }],
      new Map([['p1', 0.5]]),
    );
    expect(out[0]?.score).toBe(1);
    expect(out[0]?.delta).toBeCloseTo(0.5, 6);
  });

  it('treats an unseen prompt as previous score 0', () => {
    const out = scoreWithDelta([{ prompt: 'new', enginePresence: { a: false } }], new Map());
    expect(out[0]?.delta).toBe(0);
  });
});
