/**
 * AdvocacyFooter — source-string substrate tests
 * Verifies that the component source contains links to all three
 * advocacy pages and the expected link labels.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const SOURCE = readFileSync(
  join(process.cwd(), 'src/components/field/AdvocacyFooter.tsx'),
  'utf-8',
);

describe('AdvocacyFooter source', () => {
  it('links to /field/faq', () => {
    expect(SOURCE).toContain('/field/faq');
  });

  it('links to /field/seal', () => {
    expect(SOURCE).toContain('/field/seal');
  });

  it('links to /field/rights', () => {
    expect(SOURCE).toContain('/field/rights');
  });

  it('contains "FAQ" link label', () => {
    expect(SOURCE).toContain('FAQ');
  });

  it('contains "How records are sealed" link label', () => {
    expect(SOURCE).toContain('How records are sealed');
  });

  it('contains "Your rights" link label', () => {
    expect(SOURCE).toContain('Your rights');
  });

  it('is a Server Component (no "use client" directive)', () => {
    expect(SOURCE).not.toContain("'use client'");
    expect(SOURCE).not.toContain('"use client"');
  });

  it('sets minimum touch target via minHeight on link styles', () => {
    expect(SOURCE).toContain('44px');
  });
});
