import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo/site';
import { listGuides } from '@/lib/seo/guides';

// Build-time sitemap. Static marketing/reference surfaces are listed
// explicitly; every guide is enumerated from the registry
// (src/lib/seo/guides.ts) so shipping a guide adds it here automatically.
// Only public, indexable routes are included — the product app, auth, API,
// /privacy and /terms (disallowed in robots.txt) are excluded.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE_URL;

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/guides`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/get-started`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/wles`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/wles/spec`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/wles/implementers`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/wles/verifier`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/wles/foundation`, changeFrequency: 'monthly', priority: 0.5 },
  ];

  const guideRoutes: MetadataRoute.Sitemap = listGuides().map((g) => ({
    url: `${base}${g.path}`,
    lastModified: new Date(g.modified),
    changeFrequency: g.changeFrequency ?? 'monthly',
    priority: g.priority ?? 0.7,
  }));

  return [...staticRoutes, ...guideRoutes];
}
