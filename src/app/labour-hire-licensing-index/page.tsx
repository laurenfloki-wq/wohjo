// /labour-hire-licensing-index — the Australian Labour Hire Licensing Index.
// An original, citable cross-jurisdiction dataset (CC BY 4.0) with a live SA
// transition tracker. Dataset + BreadcrumbList + WebPage(speakable) JSON-LD.
// Renders from the same committed data the JSON distribution serves.

import type { Metadata } from 'next';
import { Fragment } from 'react';
import Link from 'next/link';
import '@/components/content/content.css';
import { ContentHeader, DEFAULT_DISCLAIMER } from '@/components/content/ArticleLayout';
import { Breadcrumbs } from '@/components/content/Breadcrumbs';
import { ComparisonTable, Related, Sources } from '@/components/content/blocks';
import { JsonLd, breadcrumbSchema, datasetSchema } from '@/lib/seo/jsonld';
import { contentViewport } from '@/lib/seo/metadata';
import { OG_IMAGE_URL, ORG, abs } from '@/lib/seo/site';
import { licenceStatePath } from '@/lib/seo/labour-hire-licence';
import {
  LICENSING_INDEX_PATH,
  LICENSING_INDEX_CAPTURED_AT,
  SA_TRANSITION_DEADLINE,
  INDEX_METRICS,
  getLicensingIndexRows,
  daysUntilSADeadline,
} from '@/lib/seo/licensing-index';

export const viewport = contentViewport;

const TITLE = 'Australian Labour Hire Licensing Index';
const DESCRIPTION =
  'An open, cross-jurisdiction snapshot of Australia’s labour hire licensing system — which states run schemes, under which Acts and regulators, and a live SA deadline tracker.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: abs(LICENSING_INDEX_PATH),
    languages: { 'en-au': abs(LICENSING_INDEX_PATH), 'x-default': abs(LICENSING_INDEX_PATH) },
  },
  openGraph: {
    type: 'website',
    locale: 'en_AU',
    siteName: 'FLOSTRUCTION',
    title: TITLE,
    description: DESCRIPTION,
    url: abs(LICENSING_INDEX_PATH),
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

function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return `${d} ${months[m - 1]} ${y}`;
}

/** Thousands separator, locale-independent for deterministic SSR. */
function formatCount(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// The active-provider counts are the latest annual-reporting position
// (financial year to 30 June 2025), distinct from the dataset capture date.
const COUNTS_AS_AT = 'as at 30 June 2025';

export default function LicensingIndexPage() {
  const rows = getLicensingIndexRows();
  const schemeCount = rows.filter((r) => r.hasScheme).length;
  const noSchemeCount = rows.length - schemeCount;
  const daysToSa = daysUntilSADeadline();

  const capturedCounts = rows
    .filter((r) => r.hasScheme && typeof r.metrics?.activeProviders === 'number')
    .map((r) => ({ state: r.state, count: r.metrics!.activeProviders as number }))
    .sort((a, b) => b.count - a.count);
  const uncapturedStates = rows
    .filter((r) => r.hasScheme && (r.metrics?.activeProviders ?? null) === null)
    .map((r) => r.state);

  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Labour hire licensing', path: '/labour-hire-licence' },
    { name: 'Licensing Index', path: LICENSING_INDEX_PATH },
  ];

  const webPageSpeakable = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': abs(LICENSING_INDEX_PATH),
    url: abs(LICENSING_INDEX_PATH),
    name: TITLE,
    inLanguage: 'en-AU',
    speakable: { '@type': 'SpeakableSpecification', cssSelector: ['h1', '.answer'] },
  };

  const dataset = datasetSchema({
    name: TITLE,
    description: DESCRIPTION,
    path: LICENSING_INDEX_PATH,
    dateModified: LICENSING_INDEX_CAPTURED_AT,
    temporalCoverage: LICENSING_INDEX_CAPTURED_AT,
    distributionUrl: abs('/labour-hire-licensing-index.json'),
    variableMeasured: [
      'Mandatory labour hire licensing scheme',
      'Governing Act',
      'Administering regulator',
      'Public register',
      ...INDEX_METRICS.map((m) => m.label),
    ],
    keywords: ['labour hire', 'licensing', 'Australia', 'compliance', 'workforce'],
  });

  return (
    <div className="flos-article">
      <JsonLd data={[breadcrumbSchema(crumbs), webPageSpeakable, dataset]} />
      <ContentHeader />

      <main id="main" tabIndex={-1}>
        <div className="wrap">
          <Breadcrumbs crumbs={crumbs} />
        </div>

        <div className="hero">
          <div className="wrap">
            <p className="eyebrow">
              Open dataset · CC BY 4.0 · Updated {formatLongDate(LICENSING_INDEX_CAPTURED_AT)}
            </p>
            <h1>Australian Labour Hire Licensing Index</h1>
            <div className="answer">
              <p className="k">The snapshot</p>
              <p>
                As at {formatLongDate(LICENSING_INDEX_CAPTURED_AT)},{' '}
                <strong>
                  {schemeCount} of {rows.length}
                </strong>{' '}
                Australian jurisdictions operate a mandatory labour hire licensing scheme —
                Queensland, Victoria, South Australia and the ACT — each under its own Act and
                regulator, with a public register. The other {noSchemeCount} (New South Wales,
                Western Australia, Tasmania and the Northern Territory) have no dedicated scheme.
                South Australia’s scheme expanded to all sectors, with an unlicensed-supply deadline
                of {formatLongDate(SA_TRANSITION_DEADLINE)}.
              </p>
            </div>
            <p className="muted">
              Compiled by {ORG.name}. Open data under{' '}
              <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> — reuse with
              attribution. Machine-readable:{' '}
              <a href="/labour-hire-licensing-index.json">labour-hire-licensing-index.json</a>.
            </p>
          </div>
        </div>

        <article>
          <div className="wrap">
            {daysToSa >= 0 && (
              <>
                <h2>South Australia transition deadline</h2>
                <p className="pull">
                  {daysToSa} day{daysToSa === 1 ? '' : 's'} until South Australia’s labour hire
                  licensing deadline ({formatLongDate(SA_TRANSITION_DEADLINE)}).
                </p>
                <p>
                  South Australia’s scheme expanded on 29 January 2026 to cover all labour hire, not
                  only the previously specified high-risk sectors, subject to a six-month
                  transition. From {formatLongDate(SA_TRANSITION_DEADLINE)}, penalties apply to
                  providers operating without a licence and to anyone who engages an unlicensed
                  provider.
                </p>
              </>
            )}

            <h2>Licensing by jurisdiction</h2>
            <ComparisonTable
              caption={`Australian labour hire licensing system — as at ${formatLongDate(LICENSING_INDEX_CAPTURED_AT)}`}
              columns={['Jurisdiction', 'Mandatory scheme', 'Act', 'Regulator', 'Public register']}
              sealColumn={1}
              rows={rows.map((r) => ({
                label: (
                  <Link href={licenceStatePath(r.slug)}>
                    {r.state} ({r.abbr})
                  </Link>
                ),
                cells: [
                  r.hasScheme ? 'Yes' : 'No',
                  r.act ?? '—',
                  r.regulator ? r.regulator.replace(/ \(.*\)$/, '') : '—',
                  r.registerUrl ? <a href={r.registerUrl}>Register</a> : '—',
                ],
              }))}
            />

            <h2>Quantitative metrics</h2>
            <p>
              The Index also tracks, per scheme jurisdiction, the figures each regulator reports:{' '}
              {INDEX_METRICS.map((m) => m.label.toLowerCase()).join(', ')}. Pending applications are
              a leading indicator of market growth; suspensions, cancellations and enforcement
              outcomes are a measure of how actively a scheme is policed.
            </p>
            {capturedCounts.length > 0 && (
              <p className="pull">
                {COUNTS_AS_AT.charAt(0).toUpperCase() + COUNTS_AS_AT.slice(1)}, the most recent
                regulator annual reporting records{' '}
                {capturedCounts.map((c, i) => (
                  <Fragment key={c.state}>
                    {i > 0 && (i === capturedCounts.length - 1 ? ' and ' : ', ')}
                    <strong>{formatCount(c.count)}</strong>
                    {i === 0 ? ` licensed labour hire providers in ${c.state}` : ` in ${c.state}`}
                  </Fragment>
                ))}
                .
                {uncapturedStates.length > 0 && (
                  <>
                    {' '}
                    {uncapturedStates.join(' and ')} do not publish a current total, so those counts
                    are shown as not yet available rather than estimated.
                  </>
                )}
              </p>
            )}
            <p className="muted">
              The public registers are interactive lookups rather than published totals, so the
              active-provider counts are taken from each regulator&rsquo;s most recent annual
              reporting, captured and dated here, never estimated. Where a figure is not yet
              available it is shown as such rather than guessed; the machine-readable file carries
              each figure with its capture date.
            </p>

            <h2>Methodology and sources</h2>
            <p>
              Structural facts (which jurisdictions run a scheme, the governing Act, and the
              regulator) are drawn from each official regulator and are cross-checked on the
              matching <a href="/labour-hire-licence">state licensing pages</a>. Quantitative
              figures are taken from each regulator&rsquo;s published annual reporting — the public
              registers are interactive lookups that do not publish totals — and the active-provider
              counts shown are {COUNTS_AS_AT}. The dataset is versioned with a capture date and
              refreshed on a recurring basis; the current capture is{' '}
              {formatLongDate(LICENSING_INDEX_CAPTURED_AT)}.
            </p>

            <h2>How to cite this data</h2>
            <p>
              {ORG.name} ({LICENSING_INDEX_CAPTURED_AT.slice(0, 4)}). Australian Labour Hire
              Licensing Index. <a href={abs(LICENSING_INDEX_PATH)}>{abs(LICENSING_INDEX_PATH)}</a>.
              Licensed under CC BY 4.0.
            </p>

            <h2>Where licensing stops and evidence begins</h2>
            <p className="pull">
              A licence confirms a provider is permitted to supply workers. It says nothing about
              whether the <a href="/fair-work-worked-hour-records">record of the hours</a> those
              workers actually worked will hold up if it is ever challenged.
            </p>
            <p>
              That is the gap the <a href="/wles">Workforce Ledger Evidentiary Standard (WLES)</a>{' '}
              addresses: hours verified at the point of work, approved by the supervisor, and sealed
              into a tamper-evident record before payroll.
            </p>

            <Related
              links={[
                { href: '/labour-hire-licence', label: 'Labour hire licensing across Australia' },
                {
                  href: '/payday-super-labour-hire',
                  label: 'Payday Super for construction & labour hire',
                },
                { href: '/wles', label: 'The Workforce Ledger Evidentiary Standard (WLES)' },
              ]}
            />

            <Sources>
              Active-provider counts: Queensland Office of Industrial Relations,{' '}
              <a href="https://qpc.qld.gov.au/docs/regulator-performance-reports/state-development-infrastructure-and-planning-portfolio/OIR%20Regulator%20Performance%20Report%202024-2025.pdf">
                Regulatory Performance Self-Assessment Report 2024-25
              </a>{' '}
              (4,039); Victorian Labour Hire Authority,{' '}
              <a href="https://www.labourhireauthority.vic.gov.au/about-us/annual-reports/">
                Annual Report 2024-25
              </a>{' '}
              (5,788). Structural facts: each state labour hire regulator (Labour Hire Licensing
              Queensland, the Labour Hire Authority, Consumer and Business Services, WorkSafe ACT),
              cited on the relevant <a href="/labour-hire-licence">state licensing page</a>; and the
              Fair Work Ombudsman,{' '}
              <a href="https://www.fairwork.gov.au/find-help-for/labour-hire-and-supply-chains/managing-your-labour-contracting">
                Managing your labour contracting
              </a>
              .
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
