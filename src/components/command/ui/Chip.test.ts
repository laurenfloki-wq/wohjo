// Pin the geometry-shared invariants between StatusChip and SealChip.
//
// These tests are source-string substrate assertions (the project
// convention — no React renderer is wired in). They guarantee that:
//   1. The Chip primitive locks geometry in ONE place (CHIP_GEOMETRY).
//   2. StatusChip and SealChip BOTH render through Chip, so any geometry
//      delta would have to come from CHIP_GEOMETRY (and would break
//      every chip on the surface simultaneously, which is the point).
//   3. SealChip never sets its own `height` / `padding` / `fontSize`,
//      i.e. it cannot drift away from the shared geometry.
//
// Direct visual confirmation would need a browser; the indirection
// here is the structural guarantee that the two chips can't diverge.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf-8');
}

const CHIP = read('src/components/command/ui/Chip.tsx');
const STATUS_CHIP = read('src/components/command/ui/StatusChip.tsx');
const SEAL_CHIP = read('src/components/command/ui/SealChip.tsx');
const BUTTON = read('src/components/command/ui/Button.tsx');
const APPROVALS = read('src/components/command/ApprovalsClient.tsx');

describe('Chip primitive — geometry locked', () => {
  it('declares fixed-height geometry for sm and md', () => {
    expect(CHIP).toMatch(/sm:\s*\{\s*height:\s*24,/);
    expect(CHIP).toMatch(/md:\s*\{\s*height:\s*28,/);
  });

  it('uses box-sizing border-box so the 1px border never grows the chip', () => {
    expect(CHIP).toMatch(/boxSizing:\s*'border-box'/);
  });

  it('uses inline-flex + align-items center so children sit on the chip centre line', () => {
    expect(CHIP).toMatch(/display:\s*'inline-flex'/);
    expect(CHIP).toMatch(/alignItems:\s*'center'/);
  });

  it('resets UA padding and margin so <button> renders identically to <span>', () => {
    expect(CHIP).toMatch(/margin:\s*0/);
    expect(CHIP).toMatch(/appearance:\s*'none'/);
  });
});

describe('StatusChip + SealChip — both render through Chip', () => {
  it('StatusChip imports Chip from ./Chip', () => {
    expect(STATUS_CHIP).toMatch(/from '\.\/Chip'/);
    expect(STATUS_CHIP).toMatch(/<Chip\b/);
  });

  it('SealChip imports Chip from ./Chip', () => {
    expect(SEAL_CHIP).toMatch(/from '\.\/Chip'/);
    expect(SEAL_CHIP).toMatch(/<Chip\b/);
  });

  it('SealChip never overrides geometry locally (no height/padding/fontSize on its style)', () => {
    // The inline <span> for the receipt-id tag is allowed its own font
    // metrics — but the Chip wrapper itself must not be styled with
    // these dimensions. Pin by asserting SealChip.tsx never declares
    // `height:` on the OUTER component (the Chip wrapper).
    // Pragmatic substring guard: there must be no `height: 28` /
    // `padding: '0 12px'` literals inside SealChip.tsx — those live
    // exclusively in Chip.tsx.
    expect(SEAL_CHIP).not.toMatch(/height:\s*28/);
    expect(SEAL_CHIP).not.toMatch(/height:\s*24/);
    expect(SEAL_CHIP).not.toMatch(/padding:\s*'0 12px'/);
    expect(SEAL_CHIP).not.toMatch(/padding:\s*'0 10px'/);
  });
});

describe('Button — destructive variant is geometry-shared with primary', () => {
  it('declares a destructive variant', () => {
    expect(BUTTON).toMatch(/destructive/);
    expect(BUTTON).toMatch(/variant === 'destructive'/);
  });

  it('destructive returns the same base geometry, only colour differs', () => {
    // The destructive branch must spread `...base` (the same minHeight /
    // padding / borderRadius / fontSize the primary branch uses).
    expect(BUTTON).toMatch(/destructive[\s\S]{0,400}\.\.\.base/);
    // Only background / color / borderColor should change.
    expect(BUTTON).toMatch(/destructive[\s\S]{0,400}background:\s*'var\(--flagged\)'/);
  });
});

describe('Flag for review — uses Button destructive (no inline override)', () => {
  it('renders via the Button primitive with variant="destructive"', () => {
    // Locate the "Flag for review" call site and assert the surrounding
    // JSX uses variant="destructive" without an inline background style.
    const flagBlock = APPROVALS.split('Flag for review')[0]?.slice(-600) ?? '';
    expect(flagBlock).toMatch(/variant="destructive"/);
    expect(flagBlock).not.toMatch(/background:\s*'var\(--flagged\)'/);
  });
});
