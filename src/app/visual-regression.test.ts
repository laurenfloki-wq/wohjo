// Visual regression — canonical mockup-language pinning.
//
// Source-string assertion battery that pins canonical visual posture
// across three surfaces:
//   - public landing (src/components/marketing/MarketingPage.tsx + co)
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

const LANDING = read('src/components/marketing/MarketingPage.tsx');
const LANDING_MODAL = read('src/components/marketing/ContactModal.tsx');
const LANDING_CSS = read('src/components/marketing/marketing.css');
const LANDING_MARK = read('src/components/marketing/devices/FMarkBars.tsx');
const LANDING_PAYDAY = read('src/components/marketing/PaydaySection.tsx');
const GET_STARTED = read('src/app/get-started/page.tsx');
const RECEIPT = read('src/app/get-started/Receipt.tsx');
const TIMELINE = read('src/app/get-started/Timeline.tsx');
const COMMAND_NAV = read('src/components/command/CommandNav.tsx');
const COMMAND_TOKENS = read('src/styles/command-tokens.css');
const APPROVALS = read('src/components/command/ApprovalsClient.tsx');
const INTELLIGENCE_LOG = read('src/app/(command)/command/intelligence-log/page.tsx');
const SUPER_EVIDENCE = read('src/app/(command)/command/super-evidence/page.tsx');
const EVIDENCE = read('src/app/(command)/command/evidence/page.tsx');

describe('Public landing — canonical posture (marketing v5, 2026-06-10)', () => {
  // Re-pinned for the approved flostruction-v5 redesign (Lauren + Joao,
  // 2026-06-10). Copy is verbatim-locked to the prototype; the lead
  // path carries over per Lauren's brief item (b) decision.

  it('keeps the /api/contact lead-capture path (warm-channel modal)', () => {
    expect(LANDING_MODAL).toMatch(/\/api\/contact/);
    expect(LANDING_MODAL).toMatch(/Talk to us first/);
  });

  it('wires the primary CTAs to the contact modal (Book a demo / Talk to us)', () => {
    expect(LANDING).toMatch(/Book a demo/);
    expect(LANDING).toMatch(/Talk to us/);
    expect(LANDING).toMatch(/ContactModal/);
  });

  it('keeps the Payday Super notice line verbatim and anchored to #payday (v5.1)', () => {
    expect(LANDING).toMatch(
      /Payday Super starts 1 July 2026\. Are your hour records verified and ready\?/,
    );
    expect(LANDING).toMatch(/href="#payday">Learn more/);
  });

  it('keeps the FLOSMOSIS legal footer and disclaimer verbatim', () => {
    expect(LANDING).toMatch(/© 2026 FLOSMOSIS PTY LTD \(ACN 697 323 925\)/);
    expect(LANDING).toMatch(
      /It does not calculate wages, award entitlements, tax, or superannuation\./,
    );
    expect(LANDING).toMatch(/names, sites, and hashes are illustrative\./);
  });

  it('links the real Privacy and Terms routes from the footer', () => {
    expect(LANDING).toMatch(/href="\/privacy"/);
    expect(LANDING).toMatch(/href="\/terms"/);
  });

  it('uses the construction-noir shell tokens scoped under .mkt', () => {
    expect(LANDING_CSS).toMatch(/--signal:\s*#d4571a/);
    expect(LANDING_CSS).toMatch(/--ink:\s*#0b0907/);
    // Brand Suite v3 product tokens are present for in-device UI only
    expect(LANDING_CSS).toMatch(/--p-amber:\s*#D9A548/);
    expect(LANDING_CSS).toMatch(/--p-navy:\s*#0E1C2F/);
  });

  it('uses the prototype marketing mark (18-degree diagonals), brand FMark untouched', () => {
    expect(LANDING_MARK).toMatch(/rotate\(18 48 48\)/);
  });

  it('keeps the marketing surface on GSAP only (no framer-motion)', () => {
    expect(LANDING).not.toMatch(/framer-motion/);
  });

  // v5.1 re-pins (device centring + Payday Super section, 2026-06-10)

  it('centres device frames within their units on all viewports (v5.1 item 1)', () => {
    expect(LANDING_CSS).toMatch(
      /\.mkt \.device\{width:264px; position:relative; margin-left:auto; margin-right:auto\}/,
    );
  });

  it('places the Payday Super section between the problem band and the surfaces (v5.1 item 2)', () => {
    const band = LANDING.indexOf('className="band"');
    const payday = LANDING.indexOf('<PaydaySection />');
    const surfaces = LANDING.indexOf('<Surfaces />');
    expect(band).toBeGreaterThan(-1);
    expect(payday).toBeGreaterThan(band);
    expect(surfaces).toBeGreaterThan(payday);
  });

  it('keeps the Payday Super copy verbatim (compliance-load-bearing para 2 included)', () => {
    expect(LANDING_PAYDAY).toMatch(/From 1 July, super runs <em>on payday\.<\/em>/);
    expect(LANDING_PAYDAY).toMatch(/superannuation paid with every pay run, not every quarter/);
    expect(LANDING_PAYDAY).toMatch(
      /doesn&apos;t calculate wages or super\. It seals verified hours/,
    );
    expect(LANDING_PAYDAY).toMatch(/EVERY PAY RUN<\/b><span>super due with wages/);
    expect(LANDING_PAYDAY).toMatch(/WEEKLY RUNS<\/b><span>weekly exposure/);
    expect(LANDING_PAYDAY).toMatch(/VERIFIED HOURS IN<\/b><span>clean payroll out/);
    expect(LANDING_PAYDAY).toMatch(/className="pdlink reveal d4" href="#action">See the system/);
    expect(LANDING_PAYDAY).toMatch(/1 JULY 2026 · AEST/);
  });

  it('renders the countdown SSR-safe (placeholder server-side, filled on hydration)', () => {
    expect(LANDING_PAYDAY).toMatch(/clock \? clock\.num : '—'/);
    expect(LANDING_PAYDAY).toMatch(/paydayCountdown\(Date\.now\(\)\)/);
  });

  it('keeps the Payday Super section on the vanilla reveal system (no GSAP)', () => {
    expect(LANDING_PAYDAY).toMatch(/RevealSection/);
    expect(LANDING_PAYDAY).not.toMatch(/gsap|ScrollTrigger/);
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
  it('defines the canonical cream-paper palette tokens — warm cream ground + navy accent + passport-green verified', () => {
    // 16 Jun 2026 repaint: the /command ground is the canonical warm
    // cream paper (same sanctioned set as page-tokens.ts), superseding
    // the cooler Radix-Sand near-white. --surface is raised warm-white;
    // cards separate via --rule hairline + a single faint --card-shadow.
    // Accent is navy (marketing temperature); verified stays passport
    // green.
    for (const token of [
      '--paper: #F7F4EC',
      '--bg-ledger: #F2EEE2',
      '--surface: #FFFEF9',
      '--rule: #E5DECD',
      '--rule-strong: #D7CFBA',
      '--ink: #1F1B14',
      '--ink-muted: #6E6657',
      '--accent: #0E1C2F',
      '--verified: #1E6B3C',
      '--verified-deep: #14532B',
      '--review: #8A6116',
      '--flagged: #B5402F',
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
    const commandSurfaces = [
      COMMAND_NAV,
      APPROVALS,
      INTELLIGENCE_LOG,
      SUPER_EVIDENCE,
      EVIDENCE,
    ].join('\n');
    expect(commandSurfaces).not.toMatch(/#c8530a/i);
  });

  it('Flostruction wordmark casing is consistent on the public surface', () => {
    // Marketing v5 uses "Flostruction" (mixed-case) in body copy per
    // canonical marketing voice; the all-caps FLOSTRUCTION wordmark is
    // reserved for the brand lockup. Pin a body-copy line from the
    // problem band (verbatim from flostruction-v5.html:481).
    expect(LANDING).toMatch(/Flostruction&apos;s answer is simple: evidence when you need it\./);
  });
});
