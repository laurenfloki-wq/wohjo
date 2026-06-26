// /labour-hire-licence — the labour hire licensing hub. Overview of which
// Australian jurisdictions require a labour hire licence, with a comparison
// table linking to each per-state answer page. CollectionPage + ItemList +
// BreadcrumbList schema. The only call to action is the records bridge.

import type { Metadata } from 'next';
import Link from 'next/link';
import '@/components/content/content.css';
import { ContentHeader, DEFAULT_DISCLAIMER } from '@/components/content/ArticleLayout';
import { Breadcrumbs } from '@/components/content/Breadcrumbs';
import { ComparisonTable, Related, Sources } from '@/components/content/blocks';
import { JsonLd, breadcrumbSchema } from '@/lib/seo/jsonld';
import { contentViewport } from '@/lib/seo/metadata';
import { OG_IMAGE_URL, abs } from '@/lib/seo/site';
import { LICENCE_STATES, LICENCE_HUB_PATH, licenceStatePath } from '@/lib/seo/labour-hire-licence';

export const viewport = contentViewport;

const TITLE = 'Labour hire licensing in Australia by state';
const DESCRIPTION =
  'Which Australian states require a labour hire licence? Queensland, Victoria, South Australia and the ACT run mandatory schemes; NSW, WA, Tasmania and the NT do not. Compare by state.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: abs(LICENCE_HUB_PATH),
    languages: { 'en-au': abs(LICENCE_HUB_PATH), 'x-default': abs(LICENCE_HUB_PATH) },
  },
  openGraph: {
    type: 'website',
    locale: 'en_AU',
    siteName: 'FLOSTRUCTION',
    title: TITLE,
    description: DESCRIPTION,
    url: abs(LICENCE_HUB_PATH),
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

function shortRegulator(regulator?: string): string {
  if (!regulator) return '—';
  return regulator.replace(/ \(.*\)$/, '');
}

export default function LabourHireLicenceHubPage() {
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Labour hire licensing', path: LICENCE_HUB_PATH },
  ];

  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': abs(LICENCE_HUB_PATH),
    name: TITLE,
    description: DESCRIPTION,
    inLanguage: 'en-AU',
    url: abs(LICENCE_HUB_PATH),
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: LICENCE_STATES.map((s, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: abs(licenceStatePath(s.slug)),
        name: `Labour hire licence in ${s.state}`,
      })),
    },
  };

  return (
    <div className="flos-article">
      <JsonLd data={[breadcrumbSchema(crumbs), collectionSchema]} />
      <ContentHeader />

      <main id="main" tabIndex={-1}>
        <div className="wrap">
          <Breadcrumbs crumbs={crumbs} />
        </div>

        <div className="hero">
          <div className="wrap">
            <p className="eyebrow">Labour hire licensing · Australia</p>
            <h1>Labour hire licensing in Australia: which states require a licence?</h1>
            <p className="lede">
              Four jurisdictions run a mandatory labour hire licensing scheme — Queensland,
              Victoria, South Australia and the ACT. New South Wales, Western Australia, Tasmania
              and the Northern Territory do not. The obligation follows where the work is supplied,
              so an operator in a no-scheme state can still need another jurisdiction’s licence.
            </p>
          </div>
        </div>

        <article>
          <div className="wrap">
            <ComparisonTable
              caption="Labour hire licensing by state and territory (as at June 2026)"
              columns={[
                'State / territory',
                'Mandatory scheme',
                'Act',
                'Regulator',
                'Public register',
              ]}
              sealColumn={1}
              rows={LICENCE_STATES.map((s) => ({
                label: (
                  <Link href={licenceStatePath(s.slug)}>
                    {s.state} ({s.abbr})
                  </Link>
                ),
                cells: [
                  s.hasScheme ? 'Yes' : 'No',
                  s.act ?? '—',
                  shortRegulator(s.regulator),
                  s.publicRegister ? 'Yes' : '—',
                ],
              }))}
            />
            <p className="muted">
              Each state link goes to a dedicated page with the sources, the cross-border position,
              and the answer for that jurisdiction. Confirm current requirements with the regulator.
            </p>

            <h2>What a licence does — and does not — cover</h2>
            <p className="pull">
              A labour hire licence confirms you’re permitted to supply workers. It says nothing
              about whether your <a href="/fair-work-worked-hour-records">record of the hours</a>{' '}
              those workers actually worked will hold up if it’s ever challenged.
            </p>
            <p>
              That is the gap the <a href="/wles">Workforce Ledger Evidentiary Standard (WLES)</a>{' '}
              addresses: hours verified at the point of work, approved by the supervisor, and sealed
              into a tamper-evident record before payroll.
            </p>

            <Related
              links={[
                {
                  href: '/payday-super-labour-hire',
                  label: 'Payday Super for construction & labour hire',
                },
                {
                  href: '/labour-hire-payroll-disputes',
                  label: 'Labour hire payroll and timesheet disputes',
                },
                { href: '/wles', label: 'The Workforce Ledger Evidentiary Standard (WLES)' },
                { href: '/guides', label: 'All guides' },
              ]}
            />

            <Sources>
              <a href="https://www.fairwork.gov.au/find-help-for/labour-hire-and-supply-chains/managing-your-labour-contracting">
                Fair Work Ombudsman — Managing your labour contracting
              </a>
              ; and each state regulator, cited on the relevant state page.
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
