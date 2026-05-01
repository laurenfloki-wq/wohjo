// WLES P0 canonical drift regression guard.
//
// Pins canonical Constitution v1.0 alignment on the three customer-facing
// surfaces identified in
// ~/Desktop/FLOSTRUCTION-Build/wles-canonical-drift-audit-2026-05-01.md:
//
//   P0 surfaces:
//     - src/app/privacy/page.tsx                (Privacy Policy)
//     - src/app/terms/page.tsx                  (Terms of Service)
//     - src/app/api/worker/records/export/route.ts (worker export verifier_url)
//     - src/lib/audit/render-html.ts            (audit pack hash-chain copy)
//     - src/app/docs/page.tsx                   (public docs landing list)
//
// Pattern matches WlesLayout.canonical.test.ts and visual-regression.test.ts:
// source-string assertion battery, no React renderer required.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf-8');
}

const PRIVACY = read('src/app/privacy/page.tsx');
const TERMS = read('src/app/terms/page.tsx');
const WORKER_EXPORT = read('src/app/api/worker/records/export/route.ts');
const AUDIT_RENDER = read('src/lib/audit/render-html.ts');
const DOCS_PAGE = read('src/app/docs/page.tsx');

describe('Privacy Policy — canonical Constitution v1.0 alignment', () => {
  it('does not refer to FLOSMOSIS as Founding Member of WLES Foundation', () => {
    expect(PRIVACY).not.toMatch(/Founding Member of the WLES Foundation/);
    expect(PRIVACY).not.toMatch(/in our capacity as Founding Member/i);
  });

  it('does not reference foundation.wles.io URLs', () => {
    expect(PRIVACY).not.toMatch(/foundation\.wles\.io/);
  });

  it('does not reference foundation@wles.io or standards@wles.io', () => {
    expect(PRIVACY).not.toMatch(/foundation@wles\.io/);
    expect(PRIVACY).not.toMatch(/standards@wles\.io/);
  });

  it('does not reference "separate incorporation" formation-phase language', () => {
    expect(PRIVACY).not.toMatch(/separate incorporation/i);
  });

  it('refers to FLOSMOSIS PTY LTD as the Foundation Entity', () => {
    expect(PRIVACY).toMatch(/Foundation Entity/);
    expect(PRIVACY).toMatch(/FLOSMOSIS PTY LTD/);
  });

  it('cites Constitution v1.0 with the canonical effective date', () => {
    expect(PRIVACY).toMatch(/Constitution v1\.0/);
    expect(PRIVACY).toMatch(/27 April 2026/);
  });

  it('cites cl 7.3 (open standard commitment) at least once', () => {
    expect(PRIVACY).toMatch(/clause 7\.3/);
  });

  it('uses standards@flosmosis.com as the Foundation contact', () => {
    expect(PRIVACY).toMatch(/standards@flosmosis\.com/);
  });
});

describe('Terms of Service — canonical Constitution v1.0 alignment', () => {
  it('does not reference foundation.wles.io URLs', () => {
    expect(TERMS).not.toMatch(/foundation\.wles\.io/);
  });

  it('does not reference wles.io as the spec hosting URL', () => {
    expect(TERMS).not.toMatch(/available at wles\.io/);
  });

  it('refers to FLOSMOSIS PTY LTD as the Foundation Entity', () => {
    expect(TERMS).toMatch(/Foundation Entity/);
    expect(TERMS).toMatch(/FLOSMOSIS PTY LTD/);
  });

  it('cites Constitution v1.0 with cl 7.3 (open standard)', () => {
    expect(TERMS).toMatch(/Constitution v1\.0/);
    expect(TERMS).toMatch(/clause 7\.3/);
  });

  it('uses flosmosis.com/wles/spec as the canonical specification URL', () => {
    expect(TERMS).toMatch(/flosmosis\.com\/wles\/spec/);
  });

  it('uses flosmosis.com/wles/foundation/constitution as the canonical Constitution URL', () => {
    expect(TERMS).toMatch(/flosmosis\.com\/wles\/foundation\/constitution/);
  });
});

describe('Worker records export — canonical verifier URL', () => {
  it('exports verifier_url pointing to flosmosis.com/wles/verifier', () => {
    expect(WORKER_EXPORT).toMatch(/verifier_url:\s*['"]https:\/\/flosmosis\.com\/wles\/verifier['"]/);
  });

  it('does not export the legacy wles.io/verifier URL', () => {
    expect(WORKER_EXPORT).not.toMatch(/https:\/\/wles\.io\/verifier/);
  });
});

describe('Audit pack render — canonical WLES expansion', () => {
  it('expands WLES as "Workforce Ledger Evidentiary Standard"', () => {
    expect(AUDIT_RENDER).toMatch(/WLES \(Workforce Ledger Evidentiary Standard\)/);
  });

  it('does not refer to the pre-pivot "Labour Event Standard" or "Flosmosis Labour Event"', () => {
    expect(AUDIT_RENDER).not.toMatch(/Labour Event Standard/);
    expect(AUDIT_RENDER).not.toMatch(/Flosmosis Labour Event/);
  });
});

describe('/docs landing list — canonical Constitution language', () => {
  it('refers to the Workforce Ledger Evidentiary Standard (not Labour Event)', () => {
    // Body-text customer-facing reference uses canonical name
    expect(DOCS_PAGE).toMatch(/Workforce[\s\n]+Ledger Evidentiary Standard/);
    // Customer-facing body text must not call out "Labour Event Standard"
    // as the standard's name. (Pre-pivot historical comments may exist; we
    // pin the body-text item explicitly via the canonical phrase above.)
    expect(DOCS_PAGE).not.toMatch(/Labour Event Standard, royalty-free/);
  });

  it('does not call the Constitution a formation-phase or 24-month-incorporation document', () => {
    expect(DOCS_PAGE).not.toMatch(/formation-phase governance document/);
    expect(DOCS_PAGE).not.toMatch(/separate-entity incorporation within 24 months/);
  });

  it('cites the Constitution v1.0 with the canonical effective date', () => {
    expect(DOCS_PAGE).toMatch(/27 April 2026/);
  });
});
