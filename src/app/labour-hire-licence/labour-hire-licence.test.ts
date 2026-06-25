import { describe, it, expect } from 'vitest';
import {
  LICENCE_STATES,
  LICENCE_HUB_PATH,
  getStateBySlug,
  licenceStatePath,
} from '@/lib/seo/labour-hire-licence';
import { getIndexableUrls } from '@/lib/seo/routes';
import { renderLlmsTxt } from '@/lib/seo/llms';
import { abs } from '@/lib/seo/site';

const SCHEME_SLUGS = ['queensland', 'victoria', 'south-australia', 'australian-capital-territory'];

describe('labour hire licence data', () => {
  it('covers eight jurisdictions with unique slugs', () => {
    expect(LICENCE_STATES).toHaveLength(8);
    const slugs = LICENCE_STATES.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(8);
  });

  it('every entry is complete, sourced, and cross-linked', () => {
    for (const s of LICENCE_STATES) {
      expect(s.answer.length).toBeGreaterThan(0);
      expect(s.whoRegulates.length).toBeGreaterThan(0);
      expect(s.crossBorder.length).toBeGreaterThan(0);
      expect(s.faq.length).toBeGreaterThanOrEqual(3);
      expect(s.faq.length).toBeLessThanOrEqual(5);
      // Sourced to official regulators — every citation is an absolute https URL.
      expect(s.sources.length).toBeGreaterThan(0);
      for (const src of s.sources) expect(src.url.startsWith('https://')).toBe(true);
      // Related slugs resolve to real jurisdictions.
      expect(s.related).toHaveLength(2);
      for (const rel of s.related) expect(getStateBySlug(rel)).toBeDefined();
    }
  });

  it('leads with an extractable Yes/No answer matching scheme status', () => {
    for (const s of LICENCE_STATES) {
      expect(s.answer.startsWith(s.hasScheme ? 'Yes' : 'No')).toBe(true);
    }
  });

  it('scheme jurisdictions name the Act and regulator; no-scheme ones do not', () => {
    for (const s of LICENCE_STATES) {
      if (SCHEME_SLUGS.includes(s.slug)) {
        expect(s.hasScheme).toBe(true);
        expect(s.act).toBeTruthy();
        expect(s.regulator).toBeTruthy();
        expect(s.regulatorUrl?.startsWith('https://')).toBe(true);
      } else {
        expect(s.hasScheme).toBe(false);
        expect(s.act).toBeUndefined();
        // The cross-border obligation is the substance for no-scheme states.
        expect(s.crossBorder).toContain('Queensland');
      }
    }
  });
});

describe('labour hire licence wiring (single source: sitemap / llms / IndexNow)', () => {
  const urls = getIndexableUrls();

  it('the hub and every state page are in the indexable route set', () => {
    expect(urls).toContain(abs(LICENCE_HUB_PATH));
    for (const s of LICENCE_STATES) {
      expect(urls).toContain(abs(licenceStatePath(s.slug)));
    }
  });

  it('llms.txt has a Licensing section listing the hub and states', () => {
    const body = renderLlmsTxt();
    expect(body).toContain('## Licensing');
    expect(body).toContain(abs(LICENCE_HUB_PATH));
    for (const s of LICENCE_STATES) {
      expect(body).toContain(abs(licenceStatePath(s.slug)));
    }
  });
});
