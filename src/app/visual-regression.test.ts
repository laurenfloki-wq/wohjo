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
const GET_STARTED = read('src/app/get-started/page.tsx');
const RECEIPT = read('src/app/get-started/Receipt.tsx');
const TIMELINE = read('src/app/get-started/Timeline.tsx');
const COMMAND_NAV = read('src/components/command/CommandNav.tsx');
const APPROVALS = read('src/components/command/ApprovalsClient.tsx');
const INTELLIGENCE_LOG = read('src/app/(command)/command/intelligence-log/page.tsx');
const SUPER_EVIDENCE = read('src/app/(command)/command/super-evidence/page.tsx');

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

  it('keeps the Payday Super notice line verbatim', () => {
    expect(LANDING).toMatch(/Payday Super starts 1 July 2026\. Are your hour records verified and ready\?/);
  });

  it('keeps the FLOSMOSIS legal footer and disclaimer verbatim', () => {
    expect(LANDING).toMatch(/© 2026 FLOSMOSIS PTY LTD \(ACN 697 323 925\)/);
    expect(LANDING).toMatch(/It does not calculate wages, award entitlements, tax, or superannuation\./);
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

describe('/command — CommandNav canonical wordmark', () => {
  it('uses Archivo Narrow display in the wordmark', () => {
    expect(COMMAND_NAV).toMatch(/Archivo Narrow/);
  });

  it('renders the F-mark glyph in the on-navy / rails-primary-only variant', () => {
    expect(COMMAND_NAV).toMatch(/<FMark/);
    expect(COMMAND_NAV).toMatch(/colour="on-navy"/);
  });

  it('exposes all seven canonical nav items in canonical order', () => {
    const nav = [
      '/command/dashboard',
      '/command/approvals',
      '/command/workers',
      '/command/sites',
      '/command/supervisors',
      '/command/intelligence-log',
      '/command/super-evidence',
    ];
    for (const href of nav) {
      expect(COMMAND_NAV).toContain(href);
    }
  });
});

describe('/command — ApprovalsClient canonical status semantics', () => {
  it('uses var(--color-green) for approved / verified state', () => {
    expect(APPROVALS).toMatch(/var\(--color-green\)/);
  });

  it('uses var(--color-amber) for pending / live-action state', () => {
    expect(APPROVALS).toMatch(/var\(--color-amber\)/);
  });

  it('uses var(--color-warm-red) for disputed / stop-action state', () => {
    expect(APPROVALS).toMatch(/var\(--color-warm-red\)/);
  });

  it('keeps the "Flostruction Verified" badge phrase', () => {
    expect(APPROVALS).toMatch(/Flostruction Verified/);
  });

  it('uses charcoal #0F0F10 as the contrast-text on amber pending pills', () => {
    // Sweep 3 specifically repainted pending pills to charcoal-on-amber
    expect(APPROVALS).toMatch(/#0F0F10/);
  });
});

describe('/command — Intelligence-log + Super-evidence Sweep 3 canonical', () => {
  it('intelligence-log uses canonical charcoal page surface tokens', () => {
    expect(INTELLIGENCE_LOG).toMatch(/charcoal|--color-bg|0F0F10/);
  });

  it('intelligence-log retains canonical IntelligenceStatusBadge or status-pill structure', () => {
    expect(INTELLIGENCE_LOG).toMatch(/IntelligenceStatusBadge|status|state/i);
  });

  it('super-evidence keeps the "Generate Evidence Pack" CTA copy', () => {
    expect(SUPER_EVIDENCE).toMatch(/Generate Evidence Pack/);
  });

  it('super-evidence references verified-hours data in its empty state', () => {
    expect(SUPER_EVIDENCE).toMatch(/verified hours/);
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
    const commandSurfaces = [COMMAND_NAV, APPROVALS, INTELLIGENCE_LOG, SUPER_EVIDENCE].join('\n');
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
