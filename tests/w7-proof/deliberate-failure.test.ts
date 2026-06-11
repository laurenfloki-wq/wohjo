// W7 / SG-8 — deliberate failing step.
//
// This file exists ONLY on the proof branch. It must turn the Unit
// suite RED and the PR must be unmergeable-by-discipline — proving the
// gate actually blocks a failing step. The PR is closed unmerged and
// the check-run id recorded in the gate report.

import { describe, it, expect } from 'vitest';

describe('W7 gate proof', () => {
  it('the gate must block this', () => {
    expect('gate').toBe('blocked');
  });
});
