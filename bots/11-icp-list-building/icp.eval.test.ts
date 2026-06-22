// Golden evals — bot 11 (ICP list-building). Pure diff, idempotent.

import { describe, it, expect } from 'vitest';
import { newLicensees, type Licensee } from './handler';

const a: Licensee = { licenceNo: 'VIC-1', name: 'Acme', state: 'VIC' };
const b: Licensee = { licenceNo: 'QLD-2', name: 'Beta', state: 'QLD' };

describe('bot 11 — ICP list-building', () => {
  it('returns only licensees not already known', () => {
    expect(newLicensees([a, b], new Set(['VIC-1']))).toEqual([b]);
  });

  it('is idempotent — re-running with all known yields nothing', () => {
    expect(newLicensees([a, b], new Set(['VIC-1', 'QLD-2']))).toEqual([]);
  });

  it('dedupes within a single pull', () => {
    expect(newLicensees([a, a], new Set())).toEqual([a]);
  });
});
