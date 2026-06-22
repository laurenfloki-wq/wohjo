// Platform-level golden evals — model routing + cost accounting (pure).

import { describe, it, expect } from 'vitest';
import { tierForTask, priceAud } from '../platform/llm';

describe('platform — model tiering', () => {
  it('routes classify/extract/route/tag/summary to Haiku', () => {
    for (const t of ['classify', 'extract', 'route', 'tag', 'summary'] as const) {
      expect(tierForTask(t)).toBe('haiku');
    }
  });

  it('routes draft/reason/redline/answer to Sonnet', () => {
    for (const t of ['draft', 'reason', 'redline', 'answer'] as const) {
      expect(tierForTask(t)).toBe('sonnet');
    }
  });
});

describe('platform — cost accounting', () => {
  it('prices Haiku deterministically (AUD)', () => {
    const aud = priceAud('haiku', { input_tokens: 1_000_000, output_tokens: 0 }, 1.5);
    // 1M input @ $1/Mtok USD * 1.5 FX = 1.5 AUD
    expect(aud).toBeCloseTo(1.5, 6);
  });

  it('discounts cached tokens', () => {
    const full = priceAud('sonnet', { input_tokens: 1_000_000, output_tokens: 0 }, 1);
    const cached = priceAud(
      'sonnet',
      { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 },
      1,
    );
    expect(cached).toBeLessThan(full);
  });
});
