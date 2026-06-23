// Golden evals — bot 44 (incident triage). Deterministic priority + grouping.

import { describe, it, expect } from 'vitest';
import { prioritise, groupIncidents, type SentryEvent } from './handler';

const e = (over: Partial<SentryEvent> & { fingerprint: string }): SentryEvent => ({
  message: 'boom',
  usersAffected: 0,
  eventsPerHour: 0,
  isRegression: false,
  ...over,
});

describe('bot 44 — incident triage', () => {
  it('assigns priority by impact and regression', () => {
    expect(prioritise(e({ fingerprint: 'a', usersAffected: 100 }))).toBe('P1');
    expect(prioritise(e({ fingerprint: 'b', isRegression: true, eventsPerHour: 20 }))).toBe('P1');
    expect(prioritise(e({ fingerprint: 'c', usersAffected: 8 }))).toBe('P2');
    expect(prioritise(e({ fingerprint: 'd', usersAffected: 1 }))).toBe('P3');
  });

  it('groups by fingerprint and sorts worst-first', () => {
    const g = groupIncidents([
      e({ fingerprint: 'x', usersAffected: 1 }),
      e({ fingerprint: 'x', usersAffected: 60 }), // worst of x
      e({ fingerprint: 'y', usersAffected: 8 }),
    ]);
    expect(g).toHaveLength(2);
    expect(g[0]?.fingerprint).toBe('x');
    expect(g[0]?.priority).toBe('P1');
    expect(g[1]?.priority).toBe('P2');
  });
});
