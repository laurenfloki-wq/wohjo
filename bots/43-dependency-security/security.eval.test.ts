// Golden evals — bot 43 (dependency & security). Deterministic triage.

import { describe, it, expect } from 'vitest';
import { severityOf, triage, type Finding } from './handler';

const f = (over: Partial<Finding> & { advisoryId: string }): Finding => ({
  cvss: 5,
  packageName: 'pkg',
  fixedIn: '1.2.3',
  ...over,
});

describe('bot 43 — dependency & security', () => {
  it('bands CVSS into severities', () => {
    expect(severityOf(9.8)).toBe('critical');
    expect(severityOf(7.5)).toBe('high');
    expect(severityOf(4.0)).toBe('medium');
    expect(severityOf(2.1)).toBe('low');
  });

  it('blocks fixable critical/high, not unfixable ones', () => {
    const t = triage([
      f({ advisoryId: 'A', cvss: 9.1, fixedIn: '2.0.0' }),
      f({ advisoryId: 'B', cvss: 8.0, fixedIn: null }),
      f({ advisoryId: 'C', cvss: 3.0, fixedIn: '1.0.1' }),
    ]);
    const byId = Object.fromEntries(t.map((x) => [x.advisoryId, x]));
    expect(byId.A?.block).toBe(true);
    expect(byId.B?.block).toBe(false); // high but no fix
    expect(byId.C?.block).toBe(false); // low
  });

  it('dedupes by advisory id keeping the highest CVSS, sorted worst-first', () => {
    const t = triage([f({ advisoryId: 'A', cvss: 5 }), f({ advisoryId: 'A', cvss: 9 })]);
    expect(t).toHaveLength(1);
    expect(t[0]?.cvss).toBe(9);
  });
});
