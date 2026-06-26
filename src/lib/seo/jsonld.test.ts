import { describe, it, expect, afterEach } from 'vitest';
import { organizationSchema, personSchema, personNode, webSiteSchema } from './jsonld';
import { ORG, AUTHOR, SITE_URL, authorSameAs } from './site';

describe('organizationSchema — entity grounding', () => {
  const node = organizationSchema();

  it('emits a non-empty knowsAbout array of strings', () => {
    const knowsAbout = node.knowsAbout as unknown;
    expect(Array.isArray(knowsAbout)).toBe(true);
    const arr = knowsAbout as unknown[];
    expect(arr.length).toBeGreaterThan(0);
    expect(arr.every((s) => typeof s === 'string' && s.length > 0)).toBe(true);
  });

  it('never emits an empty sameAs; when present it is non-empty and https-only', () => {
    if ('sameAs' in node) {
      const sameAs = node.sameAs as unknown[];
      expect(Array.isArray(sameAs)).toBe(true);
      expect(sameAs.length).toBeGreaterThan(0);
      expect(sameAs.every((u) => typeof u === 'string' && u.startsWith('https://'))).toBe(true);
    }
    // Mirror the invariant at the source: any sameAs entry must be an
    // absolute https URL (guards against a future non-https paste).
    expect(ORG.sameAs.every((u) => u.startsWith('https://'))).toBe(true);
  });

  it('keeps the stable @id and ACN identifier', () => {
    expect(node['@id']).toBe(ORG.id);
    expect(node.identifier).toMatchObject({ propertyID: 'ACN', value: ORG.acn });
  });
});

describe('personSchema — author entity', () => {
  const node = personSchema();

  it('is a Person with the stable @id and the real name', () => {
    expect(node['@type']).toBe('Person');
    expect(node['@id']).toBe(AUTHOR.id);
    expect(node.name).toBe('Lauren Kate de Mestre');
  });

  it('emits the three confirmed profile URLs in sameAs (all absolute https)', () => {
    const sameAs = node.sameAs as string[];
    expect(Array.isArray(sameAs)).toBe(true);
    for (const u of [
      'https://www.linkedin.com/in/lauren-de-mestre-320354aa',
      'https://www.researchgate.net/profile/Lauren-De-Mestre',
      'https://papers.ssrn.com/sol3/cf_dev/AbsByAuth.cfm?per_id=10467376',
    ]) {
      expect(sameAs).toContain(u);
    }
    expect(sameAs.every((u) => typeof u === 'string' && u.startsWith('https://'))).toBe(true);
  });

  it('personNode is the standalone form with @context, sharing the @id', () => {
    const standalone = personNode();
    expect(standalone['@context']).toBe('https://schema.org');
    expect(standalone['@id']).toBe(AUTHOR.id);
  });
});

describe('authorSameAs — ORCID is env-gated, never invented', () => {
  const ORIGINAL = process.env.NEXT_PUBLIC_ORCID_ID;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_ORCID_ID;
    else process.env.NEXT_PUBLIC_ORCID_ID = ORIGINAL;
  });

  it('appends the ORCID URL only when NEXT_PUBLIC_ORCID_ID is set', () => {
    process.env.NEXT_PUBLIC_ORCID_ID = '0009-0002-6732-8193';
    expect(authorSameAs()).toContain('https://orcid.org/0009-0002-6732-8193');
  });

  it('omits ORCID cleanly when the env var is unset (no empty/undefined entry)', () => {
    delete process.env.NEXT_PUBLIC_ORCID_ID;
    const list = authorSameAs();
    expect(list.some((u) => u.includes('orcid.org'))).toBe(false);
    expect(list.every((u) => typeof u === 'string' && u.startsWith('https://'))).toBe(true);
    // The three confirmed profiles remain regardless of ORCID.
    expect(list).toHaveLength(AUTHOR.sameAs.length);
  });
});

describe('webSiteSchema — WebSite + SearchAction', () => {
  const node = webSiteSchema();

  it('is a WebSite with a SearchAction pointing at /search', () => {
    expect(node['@type']).toBe('WebSite');
    expect(node['@id']).toBe(`${SITE_URL}/#website`);
    const action = node.potentialAction as {
      '@type'?: string;
      target?: { urlTemplate?: string };
      'query-input'?: string;
    };
    expect(action['@type']).toBe('SearchAction');
    expect(action.target?.urlTemplate).toBe(`${SITE_URL}/search?q={search_term_string}`);
    expect(action['query-input']).toBe('required name=search_term_string');
  });
});
