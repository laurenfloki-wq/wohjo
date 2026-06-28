// CI guard (P8): a DRAFT ruleset may not ship with preview removed.
//
// Two layers:
//   1. the pure invariant, proven in both directions (so the failure path is
//      covered without flipping the real files);
//   2. the live assertion — read the actual page source + the active version
//      and require they satisfy the gate. This is what fails CI if someone
//      removes `preview` while the ruleset is still `draft`, or vice-versa.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { checkPreviewGate } from './preview-gate';
import { EXPOSURE_RULESET_VERSION } from './questions';

describe('checkPreviewGate (invariant)', () => {
  it('blocks a DRAFT ruleset when preview is off', () => {
    expect(checkPreviewGate({ previewOn: false, version: '2026-06-28-draft.1' }).ok).toBe(false);
  });
  it('allows a DRAFT ruleset when preview is on', () => {
    expect(checkPreviewGate({ previewOn: true, version: '2026-06-28-draft.1' }).ok).toBe(true);
  });
  it('allows a released ruleset when preview is off', () => {
    expect(checkPreviewGate({ previewOn: false, version: '2026-06-28-r.1' }).ok).toBe(true);
  });
  it('allows a released ruleset with preview on (banner is harmless)', () => {
    expect(checkPreviewGate({ previewOn: true, version: '2026-06-28-r.1' }).ok).toBe(true);
  });
});

describe('CI guard: the live page must satisfy the preview gate', () => {
  it('the rendered <ExposureCheck> and the active ruleset version are consistent', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/app/labour-hire-exposure-check/page.tsx'),
      'utf-8',
    );
    const renders = /<ExposureCheck\b/.test(src);
    expect(renders, 'the page must render <ExposureCheck>').toBe(true);
    // `preview` appears between the tag name and the closing `>` (allow newlines).
    const previewOn = /<ExposureCheck\b[^>/]*\bpreview\b/.test(src);
    const res = checkPreviewGate({ previewOn, version: EXPOSURE_RULESET_VERSION });
    expect(res.ok, res.reason).toBe(true);
  });
});
