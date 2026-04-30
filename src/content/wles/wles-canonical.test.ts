// WLES Commit 3 — canonical language assertion across STASHED WLES content.
//
// Pins canonical Constitution-v1.0 alignment across:
//   - src/content/wles/wles-spec.html        (F5 link-out / brief)
//   - src/content/wles/wles-landing.html     (already canonical)
//   - src/content/wles/wles-foundation.html  (already canonical)
//   - src/content/wles/wles-foundation-constitution.html (verbatim Constitution)
//   - src/app/docs/page.tsx                  (F1-F4 residual)
//   - src/app/wles/implementers/page.tsx     (F6 stub)
//   - src/app/wles/verifier/page.tsx         (F6 stub)
//
// Hard rule: no pre-pivot drift language ("in formation", "in preparation"
// as a status header, "specification document in preparation",
// "alongside formation-phase", "18-24 month formation horizon",
// "Continuity Through Incorporation", "separately-incorporated WLES
// Foundation entity").

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf-8');
}

const SPEC = read('src/content/wles/wles-spec.html');
const LANDING = read('src/content/wles/wles-landing.html');
const FOUNDATION = read('src/content/wles/wles-foundation.html');
const CONSTITUTION = read('src/content/wles/wles-foundation-constitution.html');
const DOCS = read('src/app/docs/page.tsx');
const IMPLEMENTERS = read('src/app/wles/implementers/page.tsx');
const VERIFIER = read('src/app/wles/verifier/page.tsx');

describe('WLES content — canonical Constitution v1.0 alignment', () => {
  describe('wles-spec.html — F5 link-out / brief', () => {
    it('does not declare specification "in preparation" as a status header', () => {
      expect(SPEC).not.toMatch(/specification document in preparation/);
    });

    it('cites Constitution v1.0 effective date (27 April 2026)', () => {
      expect(SPEC).toMatch(/27 April 2026/);
    });

    it('cites cl 7.3 (open standard) and cl 6 (Core Principles)', () => {
      expect(SPEC).toMatch(/clause 7\.3/);
      expect(SPEC).toMatch(/clause 6/);
    });

    it('links out to /wles/implementers, /wles/verifier and /wles/foundation', () => {
      expect(SPEC).toMatch(/href="\/wles\/implementers"/);
      expect(SPEC).toMatch(/href="\/wles\/verifier"/);
      expect(SPEC).toMatch(/href="\/wles\/foundation"/);
    });
  });

  describe('wles-landing.html — already canonical', () => {
    it('cites Constitution v1.0 effective date and ACT-law governance', () => {
      expect(LANDING).toMatch(/27 April 2026/);
      expect(LANDING).toMatch(/Australian Capital Territory/);
    });

    it('identifies FLOSMOSIS PTY LTD as Foundation Entity', () => {
      expect(LANDING).toMatch(/FLOSMOSIS PTY LTD/);
      expect(LANDING).toMatch(/Foundation Entity/);
    });
  });

  describe('wles-foundation.html — already canonical', () => {
    it('cites ACN 697 323 925 + Foundation Period + Governance Council', () => {
      expect(FOUNDATION).toMatch(/697 323 925/);
      expect(FOUNDATION).toMatch(/Foundation Period/);
      expect(FOUNDATION).toMatch(/Governance Council/);
    });
  });

  describe('wles-foundation-constitution.html — verbatim Constitution v1.0', () => {
    it('contains the canonical preamble + ACN', () => {
      expect(CONSTITUTION).toMatch(/FLOSMOSIS PTY LTD \(ACN 697 323 925\)/);
    });

    it('contains all 11 numbered clause headings', () => {
      const headings = [
        '<h2>1. Definitions</h2>',
        '<h2>2. Objects and Purposes</h2>',
        '<h2>3. Governance Structure</h2>',
        '<h2>4. Decision-Making</h2>',
        '<h2>5. Governance Council</h2>',
        '<h2>6. Core Principles</h2>',
        '<h2>7. Intellectual Property</h2>',
        '<h2>8. Founding Customer Program</h2>',
        '<h2>9. Amendments</h2>',
        '<h2>10. Review</h2>',
        '<h2>11. Governing Law and Dispute Resolution</h2>',
      ];
      for (const h of headings) {
        expect(CONSTITUTION).toContain(h);
      }
    });

    it('contains the Effective Date statement (27 April 2026)', () => {
      expect(CONSTITUTION).toMatch(/adopted and entered into effect on <strong>27 April 2026<\/strong>/);
    });
  });

  describe('docs/page.tsx — F1-F4 residual fix', () => {
    it('does not contain pre-pivot "alongside formation-phase" language', () => {
      expect(DOCS).not.toMatch(/alongside the formation-phase/);
    });

    it('does not contain pre-pivot "18-24 month formation horizon"', () => {
      expect(DOCS).not.toMatch(/18-24 month formation horizon/);
    });

    it('does not cite a fictional cl 1.3 "Continuity Through Incorporation"', () => {
      expect(DOCS).not.toMatch(/Continuity Through Incorporation/);
      expect(DOCS).not.toMatch(/separately-incorporated WLES Foundation entity/);
    });

    it('treats FLOSMOSIS PTY LTD as the Foundation Entity directly', () => {
      expect(DOCS).toMatch(/FLOSMOSIS PTY LTD/);
      expect(DOCS).toMatch(/Foundation Entity/);
    });
  });

  describe('/wles/implementers — F6 stub', () => {
    it('cites cl 7.3 (open standard) as the engagement basis', () => {
      expect(IMPLEMENTERS).toMatch(/clause 7\.3/);
    });

    it('renders the WLES interest form for implementers', () => {
      expect(IMPLEMENTERS).toMatch(/<WlesInterestForm interest="implementer"/);
    });

    it('uses the canonical "implementers" nav item', () => {
      expect(IMPLEMENTERS).toMatch(/active="implementers"/);
    });
  });

  describe('/wles/verifier — F6 stub', () => {
    it('cites cl 6 (Verifiability) and cl 2.1(d) (accreditation) as the engagement basis', () => {
      expect(VERIFIER).toMatch(/clause 6/);
      expect(VERIFIER).toMatch(/clause 2\.1\(d\)/);
    });

    it('renders the WLES interest form for verifiers', () => {
      expect(VERIFIER).toMatch(/<WlesInterestForm interest="verifier"/);
    });

    it('uses the canonical "verifier" nav item', () => {
      expect(VERIFIER).toMatch(/active="verifier"/);
    });
  });
});
