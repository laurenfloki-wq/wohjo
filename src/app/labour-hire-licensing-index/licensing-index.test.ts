import { describe, it, expect } from 'vitest';
import {
  LICENSING_INDEX_PATH,
  getLicensingIndexRows,
  daysUntilSADeadline,
  licensingIndexJson,
  INDEX_METRICS,
} from '@/lib/seo/licensing-index';
import { datasetSchema } from '@/lib/seo/jsonld';
import { getIndexableUrls } from '@/lib/seo/routes';
import { abs, ORG } from '@/lib/seo/site';

const SCHEME_SLUGS = ['queensland', 'victoria', 'south-australia', 'australian-capital-territory'];

describe('licensing index data', () => {
  const rows = getLicensingIndexRows();

  it('covers all eight jurisdictions', () => {
    expect(rows).toHaveLength(8);
  });

  it('scheme jurisdictions carry a register URL and a metrics object; no-scheme do not', () => {
    for (const r of rows) {
      if (SCHEME_SLUGS.includes(r.slug)) {
        expect(r.hasScheme).toBe(true);
        expect(r.registerUrl?.startsWith('https://')).toBe(true);
        expect(r.metrics).not.toBeNull();
      } else {
        expect(r.hasScheme).toBe(false);
        expect(r.metrics).toBeNull();
      }
    }
  });

  it('does not fabricate counts — captured metrics are null until set', () => {
    for (const r of rows) {
      if (!r.metrics) continue;
      for (const m of INDEX_METRICS) {
        const v = r.metrics[m.key];
        expect(v === null || Number.isInteger(v)).toBe(true);
      }
    }
  });

  it('carries the captured active-provider counts (QLD/VIC) with SA/ACT not yet available', () => {
    const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r]));
    // Sourced 2026-06-27 from each regulator's 2024-25 annual reporting.
    expect(bySlug.queensland.metrics?.activeProviders).toBe(4039);
    expect(bySlug.victoria.metrics?.activeProviders).toBe(5788);
    // No published total — never estimated.
    expect(bySlug['south-australia'].metrics?.activeProviders).toBeNull();
    expect(bySlug['australian-capital-territory'].metrics?.activeProviders).toBeNull();
  });

  it('serves valid JSON with a capture date', () => {
    const parsed = JSON.parse(licensingIndexJson());
    expect(typeof parsed.capturedAt).toBe('string');
    expect(parsed.registers.queensland).toBeDefined();
  });
});

describe('daysUntilSADeadline (29 July 2026)', () => {
  it('counts down to zero on the deadline and goes negative after', () => {
    expect(daysUntilSADeadline(new Date('2026-07-22T00:00:00Z'))).toBe(7);
    expect(daysUntilSADeadline(new Date('2026-07-29T00:00:00Z'))).toBe(0);
    expect(daysUntilSADeadline(new Date('2026-08-05T00:00:00Z'))).toBe(-7);
  });
});

describe('Dataset JSON-LD', () => {
  const node = datasetSchema({
    name: 'Australian Labour Hire Licensing Index',
    description: 'test',
    path: LICENSING_INDEX_PATH,
    dateModified: '2026-06-26',
    temporalCoverage: '2026-06-26',
    distributionUrl: abs('/labour-hire-licensing-index.json'),
    variableMeasured: INDEX_METRICS.map((m) => m.label),
  });

  it('is a CC BY 4.0 Dataset created by the organisation, with a JSON distribution', () => {
    expect(node['@type']).toBe('Dataset');
    expect(node.license).toBe('https://creativecommons.org/licenses/by/4.0/');
    expect(node.creator).toEqual({ '@id': ORG.id });
    expect(node.isAccessibleForFree).toBe(true);
    const dist = node.distribution as {
      '@type'?: string;
      encodingFormat?: string;
      contentUrl?: string;
    };
    expect(dist['@type']).toBe('DataDownload');
    expect(dist.encodingFormat).toBe('application/json');
    expect(dist.contentUrl).toBe(abs('/labour-hire-licensing-index.json'));
    expect((node.variableMeasured as string[]).length).toBeGreaterThan(0);
  });
});

describe('licensing index is wired into the single route source', () => {
  it('the dataset page is in the indexable URL set (sitemap/llms/IndexNow)', () => {
    expect(getIndexableUrls()).toContain(abs(LICENSING_INDEX_PATH));
  });
});
