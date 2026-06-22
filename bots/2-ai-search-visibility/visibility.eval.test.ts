// Golden evals — bot 2 (AI-search visibility), FLOSMOSIS-calibrated.

import { describe, it, expect } from 'vitest';
import { presenceScore, scoreWithDelta, coverageGaps } from './handler';

describe('bot 2 — AI-search visibility', () => {
  it('scores presence as share of engines mentioning the brand', () => {
    const s = presenceScore({
      prompt: 'best labour-hire time verification',
      enginePresence: { perplexity: true, chatgpt: false, gemini: true, claude: true },
    });
    expect(s.enginesMentioning).toBe(3);
    expect(s.score).toBeCloseTo(0.75, 6);
  });

  it('computes week-over-week delta', () => {
    const out = scoreWithDelta(
      [{ prompt: 'p1', enginePresence: { a: true, b: true } }],
      new Map([['p1', 0.5]]),
    );
    expect(out[0]?.delta).toBeCloseTo(0.5, 6);
  });

  it('surfaces actionable coverage gaps worst-first with a reason', () => {
    const scored = scoreWithDelta(
      [
        { prompt: 'absent', enginePresence: { a: false, b: false } },
        { prompt: 'strong', enginePresence: { a: true, b: true } },
        { prompt: 'declining', enginePresence: { a: true, b: false } },
      ],
      new Map([['declining', 1]]),
    );
    const gaps = coverageGaps(scored);
    expect(gaps.map((g) => g.prompt)).toContain('absent');
    expect(gaps.map((g) => g.prompt)).not.toContain('strong');
    expect(gaps.find((g) => g.prompt === 'absent')?.reason).toBe('absent');
    expect(gaps.find((g) => g.prompt === 'declining')?.reason).toBe('declining');
    expect(gaps[0]?.prompt).toBe('absent'); // lowest score first
  });
});
