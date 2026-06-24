// Per-page metadata builder. Every content page calls this so the SEO
// contract (canonical, hreflang en-au + x-default, Open Graph, Twitter
// card, robots) is inherited rather than hand-rolled.
//
// Titles and descriptions are the caller's responsibility to keep within
// the contract budgets (title < 60 chars; description 150-160 chars).

import type { Metadata, Viewport } from 'next';
import { OG_IMAGE_URL, abs } from './site';

/**
 * Shared viewport for content routes — the dark theme-color matching the
 * construction-noir content surface. Pages export this as `viewport`.
 */
export const contentViewport: Viewport = { themeColor: '#0b0907' };

export interface ArticleMetadataInput {
  title: string;
  description: string;
  /** Site-relative path, e.g. '/payday-super-labour-hire'. */
  path: string;
  /** ISO date (YYYY-MM-DD). */
  published: string;
  /** ISO date (YYYY-MM-DD). */
  modified: string;
  /**
   * Optional Open Graph / Twitter overrides where the share copy differs
   * from the page title/description (the approved Payday page does this).
   */
  ogTitle?: string;
  ogDescription?: string;
  twitterTitle?: string;
  twitterDescription?: string;
}

export function buildArticleMetadata(input: ArticleMetadataInput): Metadata {
  const url = abs(input.path);
  return {
    title: input.title,
    description: input.description,
    alternates: {
      canonical: url,
      languages: {
        'en-au': url,
        'x-default': url,
      },
    },
    openGraph: {
      type: 'article',
      locale: 'en_AU',
      siteName: 'FLOSTRUCTION',
      title: input.ogTitle ?? input.title,
      description: input.ogDescription ?? input.description,
      url,
      images: [{ url: OG_IMAGE_URL, width: 1200, height: 630 }],
      publishedTime: input.published,
      modifiedTime: input.modified,
    },
    twitter: {
      card: 'summary_large_image',
      title: input.twitterTitle ?? input.ogTitle ?? input.title,
      description: input.twitterDescription ?? input.ogDescription ?? input.description,
      images: [OG_IMAGE_URL],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
    },
  };
}
