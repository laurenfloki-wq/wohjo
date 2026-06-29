// /labour-hire-exposure-check — the Labour Hire Exposure Check.
//
// A public, ungated-to-start self-assessment that returns a per-vector exposure
// profile, then offers a detailed report in exchange for contact details. The
// interactive check is the client island and the centre of the page; the
// surrounding surface is server-rendered, indexable reference content so answer
// engines can cite it.
//
// Design layer (command-light): this route is composed entirely in the
// command-light language — its own masthead, an instrument-first hero, the
// check at full attention, then the SEO/answer-engine prose as subordinate
// reference matter. Logic, scoring, questions, weights, the API, persistence
// and the released ruleset are untouched; this file recomposes presentation
// only. Structured data (Article + WebApplication + FAQPage + BreadcrumbList)
// is preserved verbatim.

import type { Metadata } from 'next';
import Link from 'next/link';
import '@/components/exposure/exposure-page.css';
import { AuthorByline } from '@/components/content/AuthorByline';
import {
  JsonLd,
  articleSchema,
  faqPageSchema,
  breadcrumbSchema,
  webApplicationSchema,
} from '@/lib/seo/jsonld';
import { buildArticleMetadata, contentViewport } from '@/lib/seo/metadata';
import { ORG } from '@/lib/seo/site';
import { ExposureMasthead } from '@/components/exposure/ExposureMasthead';
import { ExposureCheck } from '@/components/exposure/ExposureCheck';

const PATH = '/labour-hire-exposure-check';
const PUBLISHED = '2026-06-28';
const MODIFIED = '2026-06-28';

export const viewport = contentViewport;

export const metadata: Metadata = buildArticleMetadata({
  title: 'Labour Hire Exposure Check — are you exposed?',
  description:
    'A free, 2-minute self-assessment of where an Australian labour hire firm carries risk: Payday Super, state licensing, worked-hour records, Fair Work and chain-of-responsibility.',
  path: PATH,
  published: PUBLISHED,
  modified: MODIFIED,
  ogTitle: 'Labour Hire Exposure Check — are you exposed?',
  ogDescription:
    'Free, 2-minute self-assessment: Payday Super, licensing, records, Fair Work and chain exposure. See your result on screen, no sign-up to start.',
});

const CRUMBS = [
  { name: 'Home', path: '/' },
  { name: 'Guides', path: '/guides' },
  { name: 'Labour Hire Exposure Check', path: PATH },
];

// Indexable, citable FAQ — sourced facts (also feed the FAQPage schema).
const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'What is the Labour Hire Exposure Check?',
    a: 'It is a free, indicative self-assessment for Australian labour hire firms. In about two minutes it asks how you operate today — which states you supply into, how you record hours, how super is paid — and returns a plain-English profile of where you may carry risk across Payday Super, licensing, records, Fair Work and chain-of-responsibility. It is general information, not legal advice.',
  },
  {
    q: 'Does Payday Super affect labour hire?',
    a: 'Yes. From 1 July 2026, employers must pay super every pay run rather than quarterly, and contributions must be received by the employee’s fund within 7 business days of payday. For labour hire running weekly payroll that means weekly super exposure, and unpaid super can attach to a director personally through the Super Guarantee Charge and Director Penalty Notices.',
  },
  {
    q: 'Which Australian states require a labour hire licence?',
    a: 'Queensland, Victoria, South Australia and the ACT operate mandatory labour hire licensing schemes. New South Wales, Western Australia, Tasmania and the Northern Territory do not. The obligation follows where workers are supplied, not where the business is based — so a firm based in a no-scheme state still needs the destination state’s licence to supply there.',
  },
  {
    q: 'How long do I have to keep worked-hour records?',
    a: 'Australian employers must keep time-and-wages records for seven years. They must be legible, in English, and not altered except to correct a genuine error. If a required record is not kept, the employer can carry the burden of disproving an underpayment claim — so records that would survive a dispute matter.',
  },
  {
    q: 'Is this legal advice?',
    a: 'No. The check provides general information and an indicative self-assessment only. It is not legal, financial or tax advice, and using it does not create a solicitor–client relationship. It was built by an admitted solicitor and former PwC adviser as a credibility resource, but FLOSMOSIS does not provide legal services. Obtain professional advice for your circumstances.',
  },
];

/** Verified tick for the trust strip (state colour, not the navy action colour). */
function Tick() {
  return (
    <svg
      className="exp-trust-tick"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3.5 8.5l3 3 6-6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ExposureCheckPage() {
  return (
    <div className="command-light">
      <JsonLd
        data={[
          articleSchema({
            type: 'Article',
            headline: 'Labour Hire Exposure Check',
            description:
              'A free, indicative self-assessment of labour hire compliance exposure across Payday Super, state licensing, worked-hour records, Fair Work and chain-of-responsibility.',
            path: PATH,
            datePublished: PUBLISHED,
            dateModified: MODIFIED,
            about: [
              'Payday Super',
              'Labour hire licensing',
              'Fair Work record-keeping',
              'Superannuation Guarantee',
              'Labour hire',
            ],
            speakableSelector: ['.answer p'],
          }),
          webApplicationSchema({
            name: 'Labour Hire Exposure Check',
            description:
              'A free, indicative self-assessment of Australian labour hire compliance exposure across Payday Super, state licensing, worked-hour records, Fair Work and chain-of-responsibility.',
            path: PATH,
          }),
          faqPageSchema(FAQ.map((f) => ({ question: f.q, answer: f.a }))),
          breadcrumbSchema(CRUMBS),
        ]}
      />

      <ExposureMasthead />

      <main id="main" tabIndex={-1}>
        {/* ── Hero: proposition + the instrument's entry, side by side ── */}
        <section className="exp-hero">
          <div className="flos-content">
            <nav className="exp-crumbs" aria-label="Breadcrumb">
              <Link href="/">Home</Link>
              <span className="sep" aria-hidden="true">
                /
              </span>
              <Link href="/guides">Guides</Link>
              <span className="sep" aria-hidden="true">
                /
              </span>
              <span aria-current="page">Labour Hire Exposure Check</span>
            </nav>

            <div className="exp-hero-grid">
              <div className="exp-hero-lead">
                <p className="exp-eyebrow">
                  Free self-assessment · Australian labour hire · ~2 minutes
                </p>
                <h1>Labour Hire Exposure Check: see where your firm carries risk.</h1>
                <p className="exp-lede">
                  Payday Super lands 1 July 2026. Licensing rules differ by state. Records that
                  can’t survive a dispute cost firms in a claim. This check shows you, in plain
                  English, where you’re exposed — and the one next step that closes each gap.
                </p>

                <div className="exp-spec">
                  <span className="exp-figure" data-display="serif">
                    5
                  </span>
                  <span className="exp-spec-text">
                    <strong>risk areas</strong>, mapped in one short check
                    <br />
                    ~2 minutes · free · no sign-up to start
                  </span>
                </div>

                <ul className="exp-trust">
                  <li className="exp-trust-item">
                    <Tick />
                    <span>Built by an admitted NSW solicitor, former PwC.</span>
                  </li>
                  <li className="exp-trust-item">
                    <Tick />
                    <span>General information, not legal advice.</span>
                  </li>
                  <li className="exp-trust-item">
                    <Tick />
                    <span>Verifies hours — not wages, tax or super.</span>
                  </li>
                </ul>

                <AuthorByline published={PUBLISHED} modified={MODIFIED} />
              </div>

              <div className="exp-hero-instrument">
                {/* The interactive check — ungated to start. Released (founder-signed-off). */}
                <ExposureCheck />
              </div>
            </div>
          </div>
        </section>

        {/* ── Reference matter: subordinate, after the tool ── */}
        <section className="flos-content">
          <div className="exp-ref">
            <div className="answer">
              <p className="k">Short answer</p>
              <p>
                The Labour Hire Exposure Check is a free, two-minute self-assessment for Australian
                labour hire firms. It maps your current setup to five risk areas —{' '}
                <strong>Payday Super</strong>, <strong>state licensing</strong>,{' '}
                <strong>worked-hour records</strong>, <strong>Fair Work exposure</strong> and{' '}
                <strong>chain-of-responsibility</strong> — and returns an indicative profile of
                where you may be exposed, with a concrete next step for each. It is general
                information, not legal advice.
              </p>
            </div>

            <h2>What the check looks at</h2>
            <p>
              The check is deliberately short and asks only about how your operation works today —
              not what you intend to do. Each answer maps to one of five risk areas.
            </p>

            <ul className="exp-glance">
              <li>
                <strong>Payday Super readiness</strong> — from 1 July 2026, super is paid every pay
                run and must reach the fund within 7 business days; unpaid super can reach a
                director personally.
              </li>
              <li>
                <strong>Labour hire licensing</strong> — QLD, VIC, SA and the ACT run mandatory
                schemes; NSW, WA, TAS and the NT do not. The obligation follows where work is
                supplied.
              </li>
              <li>
                <strong>Records &amp; evidence</strong> — whether your worked-hour records would
                survive a disputed pay claim. Records must be kept for seven years.
              </li>
              <li>
                <strong>Wage-claim &amp; Fair Work exposure</strong> — dispute history and
                record-keeping obligations that drive underpayment risk.
              </li>
              <li>
                <strong>Chain-of-responsibility</strong> — exposure carried up the chain through
                head-contractor and principal relationships.
              </li>
            </ul>

            <h2>Why &quot;exposure&quot;, not &quot;audit&quot;</h2>
            <p>
              This is a self-assessment you run on yourself, not a formal audit or a legal opinion.
              It gives you an honest, indicative read so you can see what&apos;s worth attention
              before it becomes a problem — and decide whether a short conversation is worth your
              time. Every flagged area links to the rule it&apos;s based on, so you can see exactly
              why.
            </p>

            <div className="exp-cta">
              <h2>Want the full report?</h2>
              <p>
                The check is free and your on-screen result is yours to keep. Complete it and we’ll
                email your full report as a PDF — the step-by-step for every gap, your gaps in
                priority order, and, if it’s useful, a short, no-obligation walkthrough. No sales
                scripts.
              </p>
            </div>

            <h2>Frequently asked questions</h2>
            <div className="exp-faq">
              {FAQ.map((it) => (
                <details key={it.q}>
                  <summary>{it.q}</summary>
                  <p>{it.a}</p>
                </details>
              ))}
            </div>

            <div className="exp-related">
              <p className="k">Related</p>
              <Link href="/payday-super-labour-hire">
                Payday Super for labour hire (1 July 2026)
              </Link>
              <Link href="/labour-hire-licence">Labour hire licensing by state</Link>
              <Link href="/legally-defensible-timesheets-construction">
                Legally defensible timesheets for construction
              </Link>
            </div>

            <p className="exp-sources">
              Sources: Australian Taxation Office,{' '}
              <a href="https://www.ato.gov.au/businesses-and-organisations/super-for-employers/payday-super">
                Payday Super
              </a>
              ; Fair Work Ombudsman,{' '}
              <a href="https://www.fairwork.gov.au/pay-and-wages/pay-records">Record-keeping</a> and{' '}
              <a href="https://www.fairwork.gov.au/find-help-for/labour-hire-and-supply-chains">
                Labour hire and supply chains
              </a>
              . Indicative only; confirm current requirements at the source.
            </p>
          </div>
        </section>
      </main>

      <footer className="exp-footer">
        <div className="flos-content">
          <p className="disclaimer">
            This page provides general information only and does not constitute legal, financial, or
            tax advice. Obligations described here are administered by the relevant Australian
            authorities; confirm current requirements at the source or with a qualified adviser.
            Flostruction is a workforce time verification platform and does not calculate wages,
            award entitlements, tax, or superannuation. © 2026 {ORG.name} (ACN {ORG.acn}).
            Flostruction is a product of {ORG.name}. Built in Australia.
          </p>
        </div>
      </footer>
    </div>
  );
}
