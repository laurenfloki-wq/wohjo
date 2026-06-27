// The single source of indexable, public routes. sitemap.ts, the IndexNow
// submission, and llms.txt all derive from this — there is no second
// hard-coded URL list anywhere, so the three can never drift.
//
// Static marketing/reference surfaces are declared here with their sitemap
// metadata plus a title/description (used by llms.txt; sitemap ignores
// them); guides come from the registry (src/lib/seo/guides.ts). The product
// app, auth, API, /privacy and /terms (disallowed in robots.txt) are
// deliberately excluded.

import type { MetadataRoute } from 'next';
import { abs } from './site';
import { listGuides } from './guides';
import {
  LICENCE_STATES,
  LICENCE_HUB_PATH,
  LICENCE_MODIFIED,
  licenceStatePath,
} from './labour-hire-licence';
import { LICENSING_INDEX_PATH, LICENSING_INDEX_CAPTURED_AT } from './licensing-index';

type ChangeFrequency = NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>;

/** Section grouping for llms.txt. */
export type RouteGroup = 'Core' | 'Guides' | 'Licensing' | 'WLES';

export interface IndexableRoute {
  /** Absolute URL. */
  url: string;
  changeFrequency: ChangeFrequency;
  priority: number;
  /** ISO date for guides; omitted for evergreen static routes. */
  lastModified?: string;
  /** Human title (llms.txt link text). */
  title: string;
  /** One-line description (llms.txt link description). */
  description: string;
  /** llms.txt section. */
  group: RouteGroup;
}

interface StaticRoute {
  path: string;
  changeFrequency: ChangeFrequency;
  priority: number;
  title: string;
  description: string;
  group: Exclude<RouteGroup, 'Guides'>;
}

const STATIC_ROUTES: StaticRoute[] = [
  {
    path: '/',
    changeFrequency: 'weekly',
    priority: 1,
    group: 'Core',
    title: 'Flostruction',
    description:
      'Time verification for Australian construction and labour hire; worked hours sealed before payroll.',
  },
  {
    path: '/guides',
    changeFrequency: 'weekly',
    priority: 0.9,
    group: 'Core',
    title: 'Guides',
    description:
      'Plain-English guides on verified, dispute-proof worked hours for Australian construction labour hire.',
  },
  {
    path: '/glossary',
    changeFrequency: 'monthly',
    priority: 0.6,
    group: 'Core',
    title: 'Glossary',
    description:
      'Plain-English definitions of the labour hire, Fair Work, Payday Super and worked-hour-records terms used across the site.',
  },
  {
    path: '/get-started',
    changeFrequency: 'monthly',
    priority: 0.8,
    group: 'Core',
    title: 'Get started',
    description: 'Talk to us about verified hours before payroll for your labour hire operation.',
  },
  {
    path: '/wles',
    changeFrequency: 'monthly',
    priority: 0.8,
    group: 'WLES',
    title: 'Workforce Ledger Evidentiary Standard (WLES)',
    description: 'The open standard for verifiable, portable, tamper-evident worked-hour records.',
  },
  {
    path: '/wles/spec',
    changeFrequency: 'monthly',
    priority: 0.6,
    group: 'WLES',
    title: 'WLES specification',
    description: 'The technical specification for the Workforce Ledger Evidentiary Standard.',
  },
  {
    path: '/wles/implementers',
    changeFrequency: 'monthly',
    priority: 0.6,
    group: 'WLES',
    title: 'WLES for implementers',
    description: 'Guidance for building a WLES-conformant system.',
  },
  {
    path: '/wles/verifier',
    changeFrequency: 'monthly',
    priority: 0.6,
    group: 'WLES',
    title: 'WLES verifier',
    description: 'Verify records issued under the Workforce Ledger Evidentiary Standard.',
  },
  {
    path: '/wles/foundation',
    changeFrequency: 'monthly',
    priority: 0.5,
    group: 'WLES',
    title: 'WLES Foundation',
    description: 'The Foundation Entity that maintains the Workforce Ledger Evidentiary Standard.',
  },
];

/** Full indexable route set with sitemap + llms.txt metadata (static + guides). */
export function getIndexableRoutes(): IndexableRoute[] {
  const staticRoutes: IndexableRoute[] = STATIC_ROUTES.map((r) => ({
    url: abs(r.path),
    changeFrequency: r.changeFrequency,
    priority: r.priority,
    title: r.title,
    description: r.description,
    group: r.group,
  }));

  const guideRoutes: IndexableRoute[] = listGuides().map((g) => ({
    url: abs(g.path),
    changeFrequency: g.changeFrequency ?? 'monthly',
    priority: g.priority ?? 0.7,
    lastModified: g.modified,
    title: g.title,
    description: g.blurb,
    group: 'Guides',
  }));

  const licenceRoutes: IndexableRoute[] = [
    {
      url: abs(LICENCE_HUB_PATH),
      changeFrequency: 'monthly',
      priority: 0.8,
      lastModified: LICENCE_MODIFIED,
      title: 'Labour hire licensing in Australia by state',
      description:
        'Which states require a labour hire licence — QLD, VIC, SA and the ACT run mandatory schemes; NSW, WA, TAS and the NT do not.',
      group: 'Licensing',
    },
    {
      url: abs(LICENSING_INDEX_PATH),
      changeFrequency: 'monthly',
      priority: 0.8,
      lastModified: LICENSING_INDEX_CAPTURED_AT,
      title: 'Australian Labour Hire Licensing Index',
      description:
        'An open (CC BY 4.0) cross-jurisdiction dataset on Australia’s labour hire licensing system, with a live South Australian transition deadline tracker.',
      group: 'Licensing',
    },
    ...LICENCE_STATES.map(
      (s): IndexableRoute => ({
        url: abs(licenceStatePath(s.slug)),
        changeFrequency: 'monthly',
        priority: 0.7,
        lastModified: LICENCE_MODIFIED,
        title: `Do you need a labour hire licence in ${s.state}?`,
        description: s.metaDescription,
        group: 'Licensing',
      }),
    ),
  ];

  return [...staticRoutes, ...guideRoutes, ...licenceRoutes];
}

/** Just the absolute URLs — the list IndexNow submits. */
export function getIndexableUrls(): string[] {
  return getIndexableRoutes().map((r) => r.url);
}
