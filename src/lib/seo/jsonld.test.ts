import { describe, it, expect } from 'vitest';
import { organizationSchema } from './jsonld';
import { ORG } from './site';

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
