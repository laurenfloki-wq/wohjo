// The single source of indexable, public routes. Both sitemap.ts and the
// IndexNow submission derive from this — there is no second hard-coded URL
// list anywhere, so the two can never drift.
//
// Static marketing/reference surfaces are declared here with their sitemap
// metadata; guides come from the registry (src/lib/seo/guides.ts). The
// product app, auth, API, /privacy and /terms (disallowed in robots.txt)
// are deliberately excluded.

import type { MetadataRoute } from 'next';
import { abs } from './site';
import { listGuides } from './guides';

type ChangeFrequency = NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>;

export interface IndexableRoute {
  /** Absolute URL. */
  url: string;
  changeFrequency: ChangeFrequency;
  priority: number;
  /** ISO date for guides; omitted for evergreen static routes. */
  lastModified?: string;
}

interface StaticRoute {
  path: string;
  changeFrequency: ChangeFrequency;
  priority: number;
}

const STATIC_ROUTES: StaticRoute[] = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/guides', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/get-started', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/wles', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/wles/spec', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/wles/implementers', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/wles/verifier', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/wles/foundation', changeFrequency: 'monthly', priority: 0.5 },
];

/** Full indexable route set with sitemap metadata (static + guides). */
export function getIndexableRoutes(): IndexableRoute[] {
  const staticRoutes: IndexableRoute[] = STATIC_ROUTES.map((r) => ({
    url: abs(r.path),
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  const guideRoutes: IndexableRoute[] = listGuides().map((g) => ({
    url: abs(g.path),
    changeFrequency: g.changeFrequency ?? 'monthly',
    priority: g.priority ?? 0.7,
    lastModified: g.modified,
  }));

  return [...staticRoutes, ...guideRoutes];
}

/** Just the absolute URLs — the list IndexNow submits. */
export function getIndexableUrls(): string[] {
  return getIndexableRoutes().map((r) => r.url);
}
