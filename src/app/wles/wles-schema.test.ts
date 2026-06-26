import { describe, it, expect } from 'vitest';
import {
  WLES_SCHEMA,
  WLES_PREPRINT,
  wlesPreprint,
  wlesTechArticle,
  wlesDefinedTermSet,
} from './wles-schema';
import { AUTHOR } from '@/lib/seo/site';

const DOI = '10.13140/RG.2.2.10618.25283';
const DOI_URL = 'https://doi.org/10.13140/RG.2.2.10618.25283';

describe('WLES preprint ScholarlyArticle', () => {
  it('is exported in the rendered WLES_SCHEMA blocks', () => {
    expect(WLES_SCHEMA).toContain(wlesPreprint);
  });

  it('is a ScholarlyArticle with the exact title and DOI identity', () => {
    expect(wlesPreprint['@type']).toBe('ScholarlyArticle');
    expect(wlesPreprint['@id']).toBe(DOI_URL);
    expect(wlesPreprint.url).toBe(DOI_URL);
    expect(wlesPreprint.name).toBe(WLES_PREPRINT.title);
    expect(wlesPreprint.headline).toBe(WLES_PREPRINT.title);
    expect(wlesPreprint.inLanguage).toBe('en-AU');
    expect(wlesPreprint.datePublished).toBe('2026-06');
  });

  it('carries the DOI as a PropertyValue identifier (exact string)', () => {
    expect(wlesPreprint.identifier).toMatchObject({
      '@type': 'PropertyValue',
      propertyID: 'DOI',
      value: DOI,
    });
  });

  it('is authored by Lauren Kate de Mestre', () => {
    const author = wlesPreprint.author as { name?: string };
    expect(author.name).toBe(AUTHOR.name);
  });

  it('links to the WLES standard via about → the DefinedTermSet @id', () => {
    const about = wlesPreprint.about as { '@id'?: string };
    expect(about['@id']).toBe(wlesDefinedTermSet['@id']);
  });

  it('is bidirectionally linked: the standard cites the preprint', () => {
    const citation = wlesTechArticle.citation as { '@id'?: string };
    expect(citation['@id']).toBe(wlesPreprint['@id']);
  });
});
