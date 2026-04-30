// WLES Commit 3 — canonical language assertion for WlesLayout footer.
//
// Pre-pivot drift this test pins out:
//   "WLES Foundation · in formation"           → REMOVED
//   "Co-hosted at flosmosis.com pending..."    → REMOVED
//
// Canonical replacement (per Constitution v1.0 effective 27 April 2026,
// FLOSMOSIS PTY LTD as Foundation Entity per cl 1 + cl 7.3):
//   "FLOSMOSIS PTY LTD (ACN 697 323 925)" appears in footer
//   "Constitution v1.0" + "27 April 2026" + "cl 7.3" appear in footer
//
// Source-string assertion (no React renderer required) — matches the
// rest of the project's .ts-only test discipline.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const LAYOUT_SOURCE = fs.readFileSync(
  path.join(process.cwd(), 'src/components/wles/WlesLayout.tsx'),
  'utf-8',
);

describe('WlesLayout — canonical language (WLES Commit 3)', () => {
  it('does not contain pre-pivot "in formation" footer language', () => {
    expect(LAYOUT_SOURCE).not.toMatch(/in formation/);
  });

  it('does not contain pre-pivot "pending Foundation Entity governance" language', () => {
    expect(LAYOUT_SOURCE).not.toMatch(/pending Foundation Entity governance/);
  });

  it('identifies FLOSMOSIS PTY LTD as the Foundation Entity in the footer', () => {
    expect(LAYOUT_SOURCE).toMatch(/FLOSMOSIS PTY LTD/);
    expect(LAYOUT_SOURCE).toMatch(/ACN 697 323 925/);
    expect(LAYOUT_SOURCE).toMatch(/Foundation Entity/);
  });

  it('cites Constitution v1.0 and the 27 April 2026 effective date', () => {
    expect(LAYOUT_SOURCE).toMatch(/Constitution v1\.0/);
    expect(LAYOUT_SOURCE).toMatch(/27 April 2026/);
  });

  it('cites cl 7.3 (open standard) as the publication basis', () => {
    expect(LAYOUT_SOURCE).toMatch(/cl 7\.3/);
  });

  it('exposes the canonical implementers and verifier nav items', () => {
    expect(LAYOUT_SOURCE).toMatch(/href: '\/wles\/implementers'/);
    expect(LAYOUT_SOURCE).toMatch(/href: '\/wles\/verifier'/);
  });
});
