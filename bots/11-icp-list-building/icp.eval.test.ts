// Golden evals — bot 11 (ICP list-building), FLOSMOSIS-calibrated.

import { describe, it, expect } from 'vitest';
import { newLicensees, type Licensee } from './handler';

const vic: Licensee = { licenceNo: 'VIC-1', name: 'Acme Labour', state: 'VIC' };
const nsw: Licensee = { licenceNo: 'NSW-2', name: 'Beta Hire', state: 'NSW' };
const qld: Licensee = { licenceNo: 'QLD-3', name: 'Gamma Crews', state: 'QLD' };

describe('bot 11 — ICP list-building (calibrated)', () => {
  it('returns only new licensees, mandatory-scheme states first', () => {
    const out = newLicensees([nsw, vic], new Set());
    expect(out.map((l) => l.licenceNo)).toEqual(['VIC-1', 'NSW-2']);
    expect(out[0]?.mandatoryScheme).toBe(true);
    expect(out[1]?.mandatoryScheme).toBe(false);
  });

  it('is idempotent and dedupes within a pull', () => {
    expect(newLicensees([vic, vic], new Set(['VIC-1']))).toEqual([]);
    expect(newLicensees([qld, qld], new Set())).toHaveLength(1);
  });

  it('scores mandatory states above non-mandatory', () => {
    const out = newLicensees([nsw, qld], new Set());
    expect(out[0]?.state).toBe('QLD');
    expect((out[0]?.priority ?? 0) > (out[1]?.priority ?? 0)).toBe(true);
  });
});
