// /guides — the content hub. Lists every guide from the registry and is
// the cluster's internal-linking spine. Reuses the content chrome, tokens,
// breadcrumb and disclaimer so it sits in the same brand world as the
// guides it links to.

import type { Metadata } from 'next';
import Link from 'next/link';
import '@/components/content/content.css';
import { ContentHeader, DEFAULT_DISCLAIMER } from '@/components/content/ArticleLayout';
import { Breadcrumbs } from '@/components/content/Breadcrumbs';
import { formatDate } from '@/components/content/AuthorByline';
import { Cta } from '@/components/content/blocks';
import { JsonLd, breadcrumbSchema } from '@/lib/seo/jsonld';
import { contentViewport } from '@/lib/seo/metadata';
import { OG_IMAGE_URL, abs } from '@/lib/seo/site';
import { listGuides } from '@/lib/seo/guides';

export const viewport = contentViewport;

const TITLE = 'Guides — verified hours for construction labour hire';
const DESCRIPTION =
  'Plain-English guides to Payday Super, defensible timesheets, and labour hire payroll disputes — built on verified, dispute-proof, legally defensible hours.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: abs('/guides'),
    languages: { 'en-au': abs('/guides'), 'x-default': abs('/guides') },
  },
  openGraph: {
    type: 'website',
    locale: 'en_AU',
    siteName: 'FLOSTRUCTION',
    title: TITLE,
    description: DESCRIPTION,
    url: abs('/guides'),
    images: [{ url: OG_IMAGE_URL, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE_URL],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
};

export default function GuidesHubPage() {
  const guides = listGuides();
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Guides', path: '/guides' },
  ];

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': abs('/guides'),
    name: TITLE,
    description: DESCRIPTION,
    inLanguage: 'en-AU',
    url: abs('/guides'),
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: guides.map((g, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: abs(g.path),
        name: g.title,
      })),
    },
  };

  return (
    <div className="flos-article">
      <JsonLd data={[breadcrumbSchema(crumbs), itemListSchema]} />
      <ContentHeader />

      <main id="main" tabIndex={-1}>
        <div className="wrap">
          <Breadcrumbs crumbs={crumbs} />
        </div>

        <div className="hero">
          <div className="wrap">
            <p className="eyebrow">Guides · Construction &amp; labour hire</p>
            <h1>Guides for verified, dispute-proof worked hours</h1>
            <p className="lede">
              Practical, evidence-led guides on the rules that govern worked-hour records in
              Australian construction labour hire — and where verified hours before payroll change
              the outcome.
            </p>
          </div>
        </div>

        <article>
          <div className="wrap">
            <ul className="hub-list">
              {guides.map((g) => (
                <li key={g.path}>
                  <Link className="hub-card" href={g.path}>
                    <h2>{g.title}</h2>
                    <p>{g.blurb}</p>
                    <span className="date">Updated {formatDate(g.modified)}</span>
                  </Link>
                </li>
              ))}
            </ul>

            <Cta
              heading="See verified hours before 1 July."
              body="A straight conversation about whether verified hours before payroll is right for your operation. No sales scripts."
            />
          </div>
        </article>
      </main>

      <footer>
        <div className="wrap">
          <p className="disclaimer">{DEFAULT_DISCLAIMER}</p>
        </div>
      </footer>
    </div>
  );
}
