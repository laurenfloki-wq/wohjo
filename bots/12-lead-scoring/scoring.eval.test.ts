// Golden evals — bot 12 (lead scoring), FLOSMOSIS-calibrated.

import { describe, it, expect } from 'vitest';
import { scoreLead, type LeadSignals } from './handler';
import { LEAD_SCORING } from '../config';

function signals(over: Partial<LeadSignals> = {}): LeadSignals {
  return {
    industryIsConstructionLabourHire: false,
    labourHireLicence: { held: false, state: null },
    workerCount: 0,
    engagedEvidentiaryContent: false,
    visitedPricing: false,
    bookedDemo: false,
    openedEmail: false,
    ...over,
  };
}

describe('bot 12 — lead scoring (calibrated)', () => {
  it('scores a mandatory-licence ICP firm hot and flags same-day SDR', () => {
    const r = scoreLead(
      signals({
        industryIsConstructionLabourHire: true,
        labourHireLicence: { held: true, state: 'VIC' },
        workerCount: 220, // enterprise tier (past Growth's ceiling of 120)
        bookedDemo: true,
      }),
    );
    expect(r.band).toBe('hot');
    expect(r.sdrSameDay).toBe(true);
    expect(r.contributions.some((c) => c.rule === 'licence_mandatory_state_VIC')).toBe(true);
    expect(r.contributions.some((c) => c.rule === 'workers_enterprise_tier')).toBe(true);
  });

  it('values a mandatory-state licence above a non-mandatory one', () => {
    const vic = scoreLead(signals({ labourHireLicence: { held: true, state: 'VIC' } })).score;
    const nsw = scoreLead(signals({ labourHireLicence: { held: true, state: 'NSW' } })).score;
    expect(vic).toBeGreaterThan(nsw);
  });

  it('does not flag same-day SDR for an out-of-ICP but high-engagement lead', () => {
    const r = scoreLead(
      signals({
        visitedPricing: true,
        bookedDemo: true,
        engagedEvidentiaryContent: true,
        workerCount: 300,
      }),
    );
    // High score is possible, but not a construction labour-hire firm.
    expect(r.sdrSameDay).toBe(false);
  });

  it('does not double-count worker tiers', () => {
    const r = scoreLead(signals({ workerCount: 60 })); // growth tier only
    const tierRules = r.contributions.filter((c) => c.rule.startsWith('workers_'));
    expect(tierRules).toHaveLength(1);
    expect(tierRules[0]?.rule).toBe('workers_growth_tier');
  });

  it('bands honour the configured cutoffs', () => {
    const r = scoreLead(signals({ openedEmail: true }));
    expect(r.score).toBe(LEAD_SCORING.weights.openedEmail);
    expect(r.band).toBe('cold');
  });
});
