import { describe, it, expect } from 'vitest';
import { organizationSchema, personSchema, personNode, webSiteSchema } from './jsonld';
import { ORG, AUTHOR, SITE_URL } from './site';

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

  it('never emits an empty sameAs; when present it is non-empty and https-only', () => {
    if ('sameAs' in node) {
      const sameAs = node.sameAs as unknown[];
      expect(sameAs.length).toBeGreaterThan(0);
      expect(sameAs.every((u) => typeof u === 'string' && u.startsWith('https://'))).toBe(true);
    }
    // Source invariant: any author profile URL must be absolute https.
    expect(AUTHOR.sameAs.every((u) => u.startsWith('https://'))).toBe(true);
  });

  it('personNode is the standalone form with @context, sharing the @id', () => {
    const standalone = personNode();
    expect(standalone['@context']).toBe('https://schema.org');
    expect(standalone['@id']).toBe(AUTHOR.id);
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
