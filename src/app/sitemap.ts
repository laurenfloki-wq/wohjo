import type { MetadataRoute } from 'next';
import { getIndexableRoutes } from '@/lib/seo/routes';

// Build-time sitemap. Routes come from the single shared source
// (src/lib/seo/routes.ts), which also feeds IndexNow submission — so the
// sitemap and the IndexNow ping can never list different URLs. Adding a
// guide to the registry adds it here automatically.
export default function sitemap(): MetadataRoute.Sitemap {
  return getIndexableRoutes().map((r) => ({
    url: r.url,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
    ...(r.lastModified ? { lastModified: new Date(r.lastModified) } : {}),
  }));
}
