import { describe, it, expect } from 'vitest';
import { GLOSSARY_PATH, GLOSSARY_TERMS } from '@/lib/seo/glossary';
import { definedTermSetSchema } from '@/lib/seo/jsonld';
import { getIndexableUrls } from '@/lib/seo/routes';
import { listGuides } from '@/lib/seo/guides';
import { abs } from '@/lib/seo/site';

describe('glossary term set', () => {
  it('has unique slugs and non-trivial definitions', () => {
    const slugs = GLOSSARY_TERMS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const t of GLOSSARY_TERMS) {
      expect(t.slug).toMatch(/^[a-z0-9-]+$/);
      expect(t.term.length).toBeGreaterThan(0);
      // Each definition stands alone if an answer engine lifts it.
      expect(t.definition.length).toBeGreaterThan(60);
    }
  });

  it('does not redefine WLES — that lives at its canonical /wles term set', () => {
    for (const t of GLOSSARY_TERMS) {
      expect(t.term.toLowerCase()).not.toContain('workforce ledger evidentiary standard');
      expect(t.slug).not.toContain('wles');
    }
  });

  it('emits a DefinedTermSet where every term is a DefinedTerm in the set', () => {
    const node = definedTermSetSchema({
      name: 'Labour hire and worked-hours glossary',
      description: 'test',
      path: GLOSSARY_PATH,
      terms: GLOSSARY_TERMS.map((t) => ({ name: t.term, description: t.definition })),
    });
    expect(node['@type']).toBe('DefinedTermSet');
    const terms = node.hasDefinedTerm as { '@type': string; inDefinedTermSet: { '@id': string } }[];
    expect(terms).toHaveLength(GLOSSARY_TERMS.length);
    const setId = `${abs(GLOSSARY_PATH)}#termset`;
    for (const t of terms) {
      expect(t['@type']).toBe('DefinedTerm');
      expect(t.inDefinedTermSet['@id']).toBe(setId);
    }
  });

  it('is wired into the single route source (sitemap/llms/IndexNow)', () => {
    expect(getIndexableUrls()).toContain(abs(GLOSSARY_PATH));
  });
});

describe('Phase B answer pages are registered', () => {
  const paths = listGuides().map((g) => g.path);
  it.each([
    '/who-pays-unproven-labour-hire-hours',
    '/tamper-evident-timesheets',
    '/labour-hire-timesheet-alternatives',
  ])('guide %s is in the registry and indexable', (path) => {
    expect(paths).toContain(path);
    expect(getIndexableUrls()).toContain(abs(path));
  });
});
