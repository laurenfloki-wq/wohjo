// Golden evals — bot 31 (regulatory tracker). Due/overdue detection.
import { describe, it, expect } from 'vitest';
import { submissionAlerts, type Submission } from './handler';

const s = (over: Partial<Submission> & { id: string }): Submission => ({
  authority: 'ATO',
  status: 'draft',
  dueInDays: 100,
  ...over,
});

describe('bot 31 — regulatory tracker', () => {
  it('alerts overdue and due-soon open submissions, overdue first', () => {
    const a = submissionAlerts([
      s({ id: 'future' }),
      s({ id: 'soon', dueInDays: 7 }),
      s({ id: 'overdue', dueInDays: -2 }),
      s({ id: 'done', status: 'accepted', dueInDays: -2 }),
    ]);
    expect(a.map((x) => x.id)).toEqual(['overdue', 'soon']);
  });
});
