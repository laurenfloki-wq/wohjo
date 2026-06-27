// /glossary — plain-English definitions of the labour hire, compliance and
// worked-hour-records vocabulary used across the site. Emits a DefinedTermSet
// (each entry a DefinedTerm) + BreadcrumbList + CollectionPage(speakable).
// WLES is not redefined here — it links to its canonical /wles definition.

import type { Metadata } from 'next';
import '@/components/content/content.css';
import { ContentHeader, DEFAULT_DISCLAIMER } from '@/components/content/ArticleLayout';
import { Breadcrumbs } from '@/components/content/Breadcrumbs';
import { Related, Sources } from '@/components/content/blocks';
import { JsonLd, breadcrumbSchema, definedTermSetSchema } from '@/lib/seo/jsonld';
import { contentViewport } from '@/lib/seo/metadata';
import { OG_IMAGE_URL, abs } from '@/lib/seo/site';
import { GLOSSARY_PATH, GLOSSARY_TERMS } from '@/lib/seo/glossary';

export const viewport = contentViewport;

const TITLE = 'Labour hire and worked-hours glossary';
const DESCRIPTION =
  'Plain-English definitions of the labour hire, Fair Work, Payday Super and worked-hour-records terms used across Flostruction — labour hire licence, burden of proof, tamper-evident record, and more.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: abs(GLOSSARY_PATH),
    languages: { 'en-au': abs(GLOSSARY_PATH), 'x-default': abs(GLOSSARY_PATH) },
  },
  openGraph: {
    type: 'website',
    locale: 'en_AU',
    siteName: 'FLOSTRUCTION',
    title: TITLE,
    description: DESCRIPTION,
    url: abs(GLOSSARY_PATH),
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

export default function GlossaryPage() {
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Guides', path: '/guides' },
    { name: 'Glossary', path: GLOSSARY_PATH },
  ];

  const termSet = definedTermSetSchema({
    name: TITLE,
    description: DESCRIPTION,
    path: GLOSSARY_PATH,
    terms: GLOSSARY_TERMS.map((t) => ({ name: t.term, description: t.definition })),
  });

  const collectionSpeakable = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': abs(GLOSSARY_PATH),
    url: abs(GLOSSARY_PATH),
    name: TITLE,
    inLanguage: 'en-AU',
    speakable: { '@type': 'SpeakableSpecification', cssSelector: ['h1', '.answer'] },
  };

  return (
    <div className="flos-article">
      <JsonLd data={[breadcrumbSchema(crumbs), collectionSpeakable, termSet]} />
      <ContentHeader />

      <main id="main" tabIndex={-1}>
        <div className="wrap">
          <Breadcrumbs crumbs={crumbs} />
        </div>

        <div className="hero">
          <div className="wrap">
            <p className="eyebrow">Reference · Labour hire &amp; worked hours</p>
            <h1>Labour hire and worked-hours glossary</h1>
            <div className="answer">
              <p className="k">In short</p>
              <p>
                Plain-English definitions of the labour hire, Fair Work, Payday Super and
                worked-hour-records terms used across this site. Each definition stands on its own.
                The Workforce Ledger Evidentiary Standard has its own{' '}
                <a href="/wles">canonical definition</a> and is not repeated here.
              </p>
            </div>
          </div>
        </div>

        <article>
          <div className="wrap">
            <nav aria-label="Glossary terms" className="related">
              <p className="k">On this page</p>
              {GLOSSARY_TERMS.map((t) => (
                <a key={t.slug} href={`#${t.slug}`}>
                  {t.term}
                </a>
              ))}
            </nav>

            <div className="glossary">
              {GLOSSARY_TERMS.map((t) => (
                <section key={t.slug} id={t.slug} className="term">
                  <h2>{t.term}</h2>
                  <p>{t.definition}</p>
                </section>
              ))}
            </div>

            <h2>The standard these terms point to</h2>
            <p className="pull">
              Most of these terms describe a problem: hours that must be kept, proven, and paid on
              time. The <a href="/wles">Workforce Ledger Evidentiary Standard (WLES)</a> is the open
              standard for the record that answers them — verifiable, portable, and tamper-evident.
            </p>

            <Related
              links={[
                { href: '/wles', label: 'The Workforce Ledger Evidentiary Standard (WLES)' },
                {
                  href: '/fair-work-worked-hour-records',
                  label: 'What Fair Work expects from a worked-hour record',
                },
                {
                  href: '/labour-hire-licence',
                  label: 'Labour hire licensing across Australia',
                },
                { href: '/guides', label: 'All guides' },
              ]}
            />

            <Sources>
              Fair Work Ombudsman,{' '}
              <a href="https://www.fairwork.gov.au/workplace-problems/record-keeping-and-pay-slips">
                Record-keeping and pay slips
              </a>
              ; Australian Taxation Office,{' '}
              <a href="https://www.ato.gov.au/businesses-and-organisations/super-for-employers/payday-super">
                Payday Super
              </a>
              ; Fair Work Act 2009 (Cth).
            </Sources>
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
