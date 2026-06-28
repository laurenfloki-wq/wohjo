// Scoring-engine tests. These pin the engine MECHANICS and the two
// acceptance-critical behaviours:
//   1. NSW (no scheme) is never flagged for licensing; QLD/VIC/SA/ACT can be.
//   2. Every gap is scored from the config, and the result is stamped with
//      the ruleset version it was scored under.
//
// Weights/thresholds are DRAFT (rules.config.ts), so we assert on BANDS and
// applicability — not on exact numbers that will move on founder sign-off.

import { describe, it, expect } from 'vitest';
import { scoreExposure, operatesInSchemeState } from './score';
import { RULES, RULESET_VERSION } from './rules.config';
import type { Answers } from './types';

function vec(result: ReturnType<typeof scoreExposure>, id: string) {
  const v = result.vectors.find((x) => x.vector === id);
  if (!v) throw new Error(`vector ${id} missing from result`);
  return v;
}

describe('operatesInSchemeState', () => {
  it('is true for a scheme jurisdiction (Queensland)', () => {
    expect(operatesInSchemeState(['queensland'])).toBe(true);
  });
  it('is false for NSW-only (no scheme)', () => {
    expect(operatesInSchemeState(['new-south-wales'])).toBe(false);
  });
  it('is true when any selected state has a scheme', () => {
    expect(operatesInSchemeState(['new-south-wales', 'victoria'])).toBe(true);
  });
});

describe('scoreExposure — licensing gate (acceptance-critical)', () => {
  it('marks licensing N/A for an NSW-only operator and never flags it', () => {
    const answers: Answers = {
      states: ['new-south-wales'],
      worker_band: '6-20',
      records_method: 'paper',
      records_survive: 'unsure',
      // licence_held is gated off and should be ignored entirely
      licence_held: 'no',
      super_cadence: 'quarterly',
      director_aware: 'no',
      head_contractors: 'no',
    };
    const result = scoreExposure(answers);
    const licensing = vec(result, 'licensing');
    expect(licensing.applicable).toBe(false);
    expect(licensing.band).toBe('na');
    expect(result.biggestGap).not.toBe('licensing');
  });

  it('scores licensing for a QLD operator that holds no licence', () => {
    const answers: Answers = {
      states: ['queensland'],
      worker_band: '21-50',
      records_method: 'rostering',
      records_survive: 'yes',
      dispute_history: 'none',
      licence_held: 'no',
      super_cadence: 'each_run',
      director_aware: 'yes',
      head_contractors: 'no',
    };
    const result = scoreExposure(answers);
    const licensing = vec(result, 'licensing');
    expect(licensing.applicable).toBe(true);
    expect(licensing.band).toBe('exposed');
    expect(result.biggestGap).toBe('licensing');
  });
});

describe('scoreExposure — vector behaviour', () => {
  it('flags records when hours are on paper and would not survive a dispute', () => {
    const result = scoreExposure({
      states: ['new-south-wales'],
      records_method: 'paper',
      records_survive: 'no',
    });
    expect(vec(result, 'records').band).toBe('exposed');
  });

  it('flags payday super when super is quarterly and director is unaware', () => {
    const result = scoreExposure({
      states: ['new-south-wales'],
      super_cadence: 'quarterly',
      director_aware: 'no',
    });
    expect(vec(result, 'payday_super').band).toBe('exposed');
  });

  it('returns clear across the board for a well-run operator', () => {
    const result = scoreExposure({
      states: ['new-south-wales'],
      worker_band: '6-20',
      records_method: 'biometric',
      records_survive: 'yes',
      dispute_history: 'none',
      super_cadence: 'each_run',
      director_aware: 'yes',
      head_contractors: 'no',
    });
    expect(result.overall).toBe('clear');
    expect(result.biggestGap).toBeNull();
  });

  it('stamps the ruleset version it scored under', () => {
    const result = scoreExposure({ states: ['queensland'] });
    expect(result.version).toBe(RULESET_VERSION);
    expect(result.version).toBe(RULES.version);
  });
});

describe('scoreExposure — founder hand-off opener', () => {
  it('interpolates the operating state and records method into the opener', () => {
    const result = scoreExposure({
      states: ['queensland', 'victoria'],
      records_method: 'paper',
      records_survive: 'no',
      super_cadence: 'each_run',
      director_aware: 'yes',
    });
    // records is the biggest gap here → records opener, with method + states
    expect(result.biggestGap).toBe('records');
    expect(result.founderOpener).toContain('paper timesheets');
    expect(result.founderOpener).toContain('QLD');
  });

  it('gives a calm opener when nothing is flagged', () => {
    const result = scoreExposure({
      states: ['new-south-wales'],
      records_method: 'biometric',
      records_survive: 'yes',
      super_cadence: 'each_run',
      director_aware: 'yes',
      head_contractors: 'no',
    });
    expect(result.biggestGap).toBeNull();
    expect(result.founderOpener.toLowerCase()).toContain('no elevated exposure');
  });
});
