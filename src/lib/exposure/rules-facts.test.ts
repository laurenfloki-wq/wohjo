// Governance guard for the compliance facts. While the ruleset is DRAFT, every
// fact must be REVIEW-tagged (nothing is presented as founder-confirmed). Also
// pins that the S5 DRAFT facts were added.

import { describe, it, expect } from 'vitest';
import { RULES, RULESET_VERSION } from './rules.config';

describe('compliance facts governance', () => {
  it('every fact is REVIEW-tagged while the ruleset is DRAFT', () => {
    if (!RULESET_VERSION.toLowerCase().includes('draft')) return; // released: this guard relaxes
    for (const v of RULES.vectors) {
      for (const f of v.facts) {
        expect(f.review, `${v.id}/${f.id} must be REVIEW-tagged`).toBe(true);
      }
    }
  });

  it('every fact carries a citable source', () => {
    for (const v of RULES.vectors) {
      for (const f of v.facts) {
        expect(f.source.url).toMatch(/^https?:\/\//);
        expect(f.source.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('includes the S5 DRAFT facts (P1 records + P7 payday)', () => {
    const ids = RULES.vectors.flatMap((v) => v.facts.map((f) => f.id));
    expect(ids).toContain('records-fca-2025-roster-inadequate');
    expect(ids).toContain('payday-sgc-admin-uplift-60');
    expect(ids).toContain('payday-first-year-low-risk');
  });
});
