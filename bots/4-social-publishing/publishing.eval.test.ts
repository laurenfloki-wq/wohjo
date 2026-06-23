// Golden evals — bot 4 (social publishing). Idempotent, pre-approved only.

import { describe, it, expect } from 'vitest';
import { publishKey, duePosts, type ScheduledPost } from './handler';

const post = (over: Partial<ScheduledPost> & { id: string }): ScheduledPost => ({
  channel: 'linkedin',
  status: 'approved',
  scheduledForMs: 1000,
  ...over,
});

describe('bot 4 — social publishing', () => {
  it('derives a stable idempotency key per channel + post', () => {
    expect(publishKey(post({ id: 'p1' }))).toBe('social-publish:linkedin:p1');
  });

  it('selects only approved, due, unpublished posts', () => {
    const due = duePosts(
      [
        post({ id: 'a', scheduledForMs: 500 }),
        post({ id: 'b', status: 'draft', scheduledForMs: 500 }), // not approved
        post({ id: 'c', status: 'published', scheduledForMs: 500 }), // already sent
        post({ id: 'd', scheduledForMs: 5000 }), // future
      ],
      1000,
    );
    expect(due.map((p) => p.id)).toEqual(['a']);
  });

  it('orders due posts by schedule time', () => {
    const due = duePosts(
      [post({ id: 'late', scheduledForMs: 900 }), post({ id: 'early', scheduledForMs: 100 })],
      1000,
    );
    expect(due.map((p) => p.id)).toEqual(['early', 'late']);
  });
});
