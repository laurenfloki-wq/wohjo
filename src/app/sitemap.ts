import type { MetadataRoute } from 'next';

// Craft pass 2026-06-10: public/robots.txt has advertised
// https://flosmosis.com/sitemap.xml since Day 3 but no sitemap existed.
// Minimal set: the public marketing surfaces robots.txt allows.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://flosmosis.com';
  return [
    { url: base + '/', changeFrequency: 'weekly', priority: 1 },
    { url: base + '/wles', changeFrequency: 'monthly', priority: 0.8 },
    { url: base + '/get-started', changeFrequency: 'monthly', priority: 0.8 },
    { url: base + '/founding', changeFrequency: 'monthly', priority: 0.6 },
  ];
}
