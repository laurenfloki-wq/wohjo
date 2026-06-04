// Visual regression — canonical mockup-language pinning.
//
// Source-string assertion battery that pins canonical visual posture
// across three surfaces:
//   - public landing (src/components/shared/LandingPage.tsx)
//   - /get-started   (src/app/get-started/{page,Receipt,Timeline}.tsx)
//   - /command       (src/components/command/{CommandNav,ApprovalsClient}.tsx
//                     + src/app/(command)/command/{intelligence-log,
//                       super-evidence}/page.tsx)
//
// These tests don't render the React tree; they read the source files
// as strings and assert canonical phrases, palette tokens, and
// structural markers are present. The intent is to catch regressions
// where a refactor or quick fix accidentally rolls back canonical
// posture (e.g. cream→white, charcoal→navy, mockup amber #D9A548 →
// pre-pivot burnt orange #c8530a, "Verified hours" copy stripped).
//
// Pattern matches WlesLayout.canonical.test.ts and
// wles-canonical.test.ts established in WLES Commit 3 (27904a6).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf-8');
}

const LANDING = read('src/components/shared/LandingPage.tsx');
const GET_STARTED = read('src/app/get-started/page.tsx');
const RECEIPT = read('src/app/get-started/Receipt.tsx');
const TIMELINE = read('src/app/get-started/Timeline.tsx');
const COMMAND_NAV = read('src/components/command/CommandNav.tsx');
const COMMAND_TOKENS = read('src/styles/command-tokens.css');
const APPROVALS = read('src/components/command/ApprovalsClient.tsx');
const INTELLIGENCE_LOG = read('src/app/(command)/command/intelligence-log/page.tsx');
const SUPER_EVIDENCE = read('src/app/(command)/command/super-evidence/page.tsx');
const EVIDENCE = read('src/app/(command)/command/evidence/page.tsx');

describe('Public landing — canonical posture', () => {
  it('routes the primary CTAs to /get-started (cold-channel path)', () => {
    expect(LANDING).toMatch(/href="\/get-started"/);
    expect(LANDING).toMatch(/Get Flostruction/);
  });

  it('exposes the "Talk to us first" warm-channel modal trigger', () => {
    expect(LANDING).toMatch(/Talk to us first/);
  });

  it('keeps the verified-hours posture phrasing in the hero/positioning copy', () => {
    expect(LANDING).toMatch(/Verified hours/);
    expect(LANDING).toMatch(/verified hours, every shift\.|verified hours/i);
  });

  it('includes the Flostruction product framing (construction time verification)', () => {
    expect(LANDING).toMatch(/Flostruction is built for construction/);
    expect(LANDING).toMatch(/time verification platform/);
  });

  it('uses the public-landing scoped amber CSS variable (not the canonical mockup amber)', () => {
    // The public landing intentionally uses #c8530a as a marketing
    // variant. brand-tokens.ts uses #D9A548 for app surfaces. These
    // do NOT need to match — they are intentionally distinct.
    expect(LANDING).toMatch(/--amber:\s*#c8530a/);
  });
});

describe('/get-started — canonical palette tokens', () => {
  it('pins canonical charcoal #0F0F10 as the page surface', () => {
    expect(GET_STARTED).toMatch(/#0F0F10/);
  });

  it('pins canonical charcoal-800 #1A1A1C as the raised-card surface', () => {
    expect(GET_STARTED).toMatch(/#1A1A1C/);
  });

  it('pins canonical cream #F5F2EA as primary text on charcoal', () => {
    expect(GET_STARTED).toMatch(/#F5F2EA/);
  });

  it('pins canonical cream-200 #EDE9DF as secondary text', () => {
    expect(GET_STARTED).toMatch(/#EDE9DF/);
  });

  it('pins canonical forest #2D5F3F as the positive-confirmation accent', () => {
    expect(GET_STARTED).toMatch(/#2D5F3F/);
  });

  it('pins canonical mockup amber #D9A548 in the active PALETTE', () => {
    expect(GET_STARTED).toMatch(/#D9A548/);
    // amber must be assigned to the canonical PALETTE.amber slot — not
    // assigned to the burnt-orange pre-pivot value. Pre-pivot literal
    // #c8530a may appear in code-archaeology comments documenting the
    // migration, so we pin the active assignment line instead.
    expect(GET_STARTED).toMatch(/amber:\s*'#D9A548'/);
  });

  it('pins cream@55% rgba(245,242,234,0.55) for AAA-pass muted text', () => {
    expect(GET_STARTED).toMatch(/rgba\(245,242,234,0\.55\)/);
  });

  it('pins Archivo Narrow as the display font', () => {
    expect(GET_STARTED).toMatch(/Archivo Narrow/);
  });

  it('pins JetBrains Mono as the numerical / mono font', () => {
    expect(GET_STARTED).toMatch(/JetBrains Mono/);
  });

  it('keeps Standard plan A$499/month pricing copy', () => {
    expect(GET_STARTED).toMatch(/Standard plan/);
    expect(GET_STARTED).toMatch(/A\$499\/month/);
  });

  it('keeps the Verified-hours canonical framing', () => {
    expect(GET_STARTED).toMatch(/Verified hours/);
  });
});

describe('/get-started — Receipt and Timeline craft components', () => {
  it('Receipt component exists (Move 1 — receipt-builds-itself)', () => {
    expect(RECEIPT.length).toBeGreaterThan(100);
  });

  it('Timeline component exists (Move 5 — interactive timeline)', () => {
    expect(TIMELINE.length).toBeGreaterThan(100);
  });
});

describe('/command — design-tokens single source of truth (CADA + INST)', () => {
  it('defines the canonical light palette tokens — paper ground + document surfaces', () => {
    for (const token of [
      // INST precision pass shifts the ground to warm paper and deepens
      // verified to a passport/banknote green; --surface stays white so
      // cards read as raised documents against the paper.
      '--bg: #F4EDDC',
      '--bg-ledger: #ECE3CD',
      '--surface: #FFFFFF',
      '--border-strong: #BFB594',
      '--ink: #1B1A18',
      '--accent: #234E91',
      '--verified: #0E5C36',
      '--verified-deep: #084425',
      '--review: #7A4F00',
      '--flagged: #9E1D14',
    ]) {
      expect(COMMAND_TOKENS).toContain(token);
    }
  });

  it('defines the canonical dark variant behind [data-theme="dark"]', () => {
    expect(COMMAND_TOKENS).toMatch(/\.command-light\[data-theme="dark"\]/);
    for (const token of ['#0E0E10', '#F2F1EE', '#6E9BE8', '#5FBE8C']) {
      expect(COMMAND_TOKENS).toContain(token);
    }
  });

  it('mandates tabular lining figures by default in the scope', () => {
    expect(COMMAND_TOKENS).toMatch(/font-feature-settings: "tnum" 1, "lnum" 1/);
  });
});

describe('/command — CommandNav canonical wordmark (CADA redesign)', () => {
  it('uses the canonical FLOSTRUCTION wordmark as a tight tracked sans lockup', () => {
    // Precision pass — the F-glyph lockup didn't read cleanly at every
    // nav size; the canonical mark is now a wordmark-only lockup set in
    // Inter (--font-sans) with uppercase + 0.16em tracking. The display
    // serif is reserved for h1 + the one hero number per page.
    expect(COMMAND_NAV).toContain('FLOSTRUCTION');
    expect(COMMAND_NAV).toMatch(/var\(--font-sans\)/);
    expect(COMMAND_NAV).toMatch(/letterSpacing:\s*'0\.16em'/);
    expect(COMMAND_NAV).toMatch(/textTransform:\s*'uppercase'/);
    // No serif on the wordmark.
    expect(COMMAND_NAV).not.toMatch(/var\(--font-display\)/);
  });

  it('uses the calm accent underline for the active tab (not green)', () => {
    expect(COMMAND_NAV).toMatch(/2px solid var\(--accent\)/);
    expect(COMMAND_NAV).not.toMatch(/2px solid var\(--color-green\)/);
  });

  it('exposes the six canonical nav items in canonical order — no Intelligence tab', () => {
    const nav = [
      '/command/dashboard',
      '/command/approvals',
      '/command/workers',
      '/command/sites',
      '/command/supervisors',
      '/command/evidence',
    ];
    for (const href of nav) {
      expect(COMMAND_NAV).toContain(href);
    }
    // Intelligence is folded into Overview and removed from the nav.
    expect(COMMAND_NAV).not.toContain("href: '/command/intelligence-log'");
  });
});

describe('/command — ApprovalsClient semantics (CADA redesign)', () => {
  it('uses StatusChip semantic colour for state — not raw colour vars', () => {
    expect(APPROVALS).toContain('StatusChip');
  });

  it('renders confidence as a human label (Strong / Adequate / Review), never raw scores', () => {
    expect(APPROVALS).toMatch(/confidenceChip/);
    expect(APPROVALS).not.toMatch(/HIGH confidence|MEDIUM confidence|LOW confidence/);
  });

  it('lifts start_time_source provenance as a trust signal', () => {
    expect(APPROVALS).toMatch(/startTimeSourceLabel/);
  });

  it('uses pluralise() so "1 shift" can never render as "1 shifts"', () => {
    expect(APPROVALS).toMatch(/pluralise\(/);
  });

  it('renders dates via formatDate (DD MMM YYYY canonical)', () => {
    expect(APPROVALS).toMatch(/formatDate\(/);
  });
});

describe('/command — Evidence + super-evidence redirect (CADA redesign)', () => {
  it('canonical /command/evidence page exists and reads its data from /api/command/super-evidence', () => {
    expect(EVIDENCE).toMatch(/\/api\/command\/super-evidence/);
  });

  it('Evidence page uses the canonical "Assemble pack" copy and an Export pack as CSV action', () => {
    expect(EVIDENCE).toContain('Assemble pack');
    expect(EVIDENCE).toContain('Export pack as CSV');
  });

  it('legacy /command/super-evidence redirects to /command/evidence', () => {
    expect(SUPER_EVIDENCE).toMatch(/redirect\('\/command\/evidence'\)/);
  });

  it('intelligence-log page still exists for deep links but is no longer in the nav', () => {
    expect(INTELLIGENCE_LOG.length).toBeGreaterThan(100);
    expect(COMMAND_NAV).not.toContain('intelligence-log');
  });
});

describe('Cross-surface canonical-language invariants', () => {
  it('no surface uses pre-pivot navy literal #001f3f or #1e3a8a', () => {
    const all = [
      LANDING,
      GET_STARTED,
      RECEIPT,
      TIMELINE,
      COMMAND_NAV,
      APPROVALS,
      INTELLIGENCE_LOG,
      SUPER_EVIDENCE,
    ].join('\n');
    expect(all).not.toMatch(/#001f3f|#1e3a8a/i);
  });

  it('no /command surface leaks public-landing burnt-orange #c8530a', () => {
    const commandSurfaces = [COMMAND_NAV, APPROVALS, INTELLIGENCE_LOG, SUPER_EVIDENCE, EVIDENCE].join('\n');
    expect(commandSurfaces).not.toMatch(/#c8530a/i);
  });

  it('Flostruction wordmark casing is consistent on the public surface', () => {
    // LandingPage uses "Flostruction" (mixed-case) per canonical
    // marketing voice; check that core copy doesn't drift to all-caps
    // FLOSTRUCTION in body copy.
    expect(LANDING).toMatch(/Flostruction is built for construction/);
  });
});
