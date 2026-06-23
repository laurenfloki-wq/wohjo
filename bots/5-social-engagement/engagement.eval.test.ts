// Golden evals — bot 5 (social engagement). Deterministic classify + triage.

import { describe, it, expect } from 'vitest';
import { classifyIntent, triageComment } from './handler';

describe('bot 5 — social engagement', () => {
  it('classifies intent deterministically', () => {
    expect(classifyIntent('How does the sealing work?')).toBe('question');
    expect(classifyIntent('This is broken, I want a refund')).toBe('complaint');
    expect(classifyIntent('Love this, brilliant work')).toBe('praise');
    expect(classifyIntent('free money click here t.me/scam')).toBe('spam');
    expect(classifyIntent('nice')).toBe('other');
  });

  it('drafts only for questions and complaints, never spam', () => {
    expect(triageComment({ id: '1', text: 'How much?', authorFollowers: 10 }).shouldDraft).toBe(
      true,
    );
    expect(triageComment({ id: '2', text: 'broken refund', authorFollowers: 10 }).shouldDraft).toBe(
      true,
    );
    expect(
      triageComment({ id: '3', text: 'free money click here', authorFollowers: 0 }).shouldDraft,
    ).toBe(false);
    expect(triageComment({ id: '4', text: 'love it', authorFollowers: 0 }).shouldDraft).toBe(false);
  });
});
