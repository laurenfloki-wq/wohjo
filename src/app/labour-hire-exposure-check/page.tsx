// /labour-hire-exposure-check — the Labour Hire Exposure Check.
//
// A public, ungated-to-start self-assessment that returns a per-vector
// exposure profile, then offers a detailed report in exchange for contact
// details. The interactive check is a client island; the surrounding page is
// rich, server-rendered, indexable content (§9) so answer engines can cite it.
//
// Slice (a): static flow + Exposure Ledger + DRAFT config-driven scoring, in
// SIGN-OFF PREVIEW. Real (server-side) scoring is slice (b); persistence +
// lead capture + founder hand-off is slice (c). The page pauses here for
// founder sign-off of the question set, weights, and compliance values.

import type { Metadata } from 'next';
import '@/components/content/content.css';
import { ContentHeader, DEFAULT_DISCLAIMER } from '@/components/content/ArticleLayout';
import { Breadcrumbs } from '@/components/content/Breadcrumbs';
import { AuthorByline } from '@/components/content/AuthorByline';
import { ShortAnswer, AtAGlance, Cta, Related, Sources } from '@/components/content/blocks';
import {
  JsonLd,
  articleSchema,
  faqPageSchema,
  breadcrumbSchema,
  webApplicationSchema,
} from '@/lib/seo/jsonld';
import { buildArticleMetadata, contentViewport } from '@/lib/seo/metadata';
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
// DRAFT wording pending founder sign-off; phrased indicatively throughout.
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

export default function ExposureCheckPage() {
  return (
    <div className="flos-article">
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

      <ContentHeader />

      <main id="main" tabIndex={-1}>
        <div className="wrap">
          <Breadcrumbs crumbs={CRUMBS} schema={false} />
        </div>

        <div className="hero">
          <div className="wrap">
            <p className="eyebrow">Free self-assessment · Australian labour hire · ~2 minutes</p>
            <h1>Labour Hire Exposure Check: see where your firm carries risk.</h1>
            <p className="lede">
              Payday Super lands 1 July 2026. Licensing rules differ by state. Records that can’t
              survive a dispute cost firms in a claim. This check shows you, in plain English, where
              you’re exposed — and the one next step that closes each gap.
            </p>

            <AuthorByline published={PUBLISHED} modified={MODIFIED} />

            <ShortAnswer>
              The Labour Hire Exposure Check is a free, two-minute self-assessment for Australian
              labour hire firms. It maps your current setup to five risk areas —{' '}
              <strong>Payday Super</strong>, <strong>state licensing</strong>,{' '}
              <strong>worked-hour records</strong>, <strong>Fair Work exposure</strong> and{' '}
              <strong>chain-of-responsibility</strong> — and returns an indicative profile of where
              you may be exposed, with a concrete next step for each. It is general information, not
              legal advice.
            </ShortAnswer>
          </div>
        </div>

        <article>
          <div className="wrap">
            {/* The interactive check — ungated to start. Released (founder-signed-off). */}
            <ExposureCheck />

            <h2>What the check looks at</h2>
            <p>
              The check is deliberately short and asks only about how your operation works today —
              not what you intend to do. Each answer maps to one of five risk areas.
            </p>

            <AtAGlance
              items={[
                <>
                  <strong>Payday Super readiness</strong> — from 1 July 2026, super is paid every
                  pay run and must reach the fund within 7 business days; unpaid super can reach a
                  director personally.
                </>,
                <>
                  <strong>Labour hire licensing</strong> — QLD, VIC, SA and the ACT run mandatory
                  schemes; NSW, WA, TAS and the NT do not. The obligation follows where work is
                  supplied.
                </>,
                <>
                  <strong>Records &amp; evidence</strong> — whether your worked-hour records would
                  survive a disputed pay claim. Records must be kept for seven years.
                </>,
                <>
                  <strong>Wage-claim &amp; Fair Work exposure</strong> — dispute history and
                  record-keeping obligations that drive underpayment risk.
                </>,
                <>
                  <strong>Chain-of-responsibility</strong> — exposure carried up the chain through
                  head-contractor and principal relationships.
                </>,
              ]}
            />

            <h2>Why &quot;exposure&quot;, not &quot;audit&quot;</h2>
            <p>
              This is a self-assessment you run on yourself, not a formal audit or a legal opinion.
              It gives you an honest, indicative read so you can see what&apos;s worth attention
              before it becomes a problem — and decide whether a short conversation is worth your
              time. Every flagged area links to the rule it&apos;s based on, so you can see exactly
              why.
            </p>

            <Cta
              heading="Want the full report?"
              body="The check is free and your on-screen result is yours to keep. Complete it and we’ll email your full report as a PDF — the step-by-step for every gap, your gaps in priority order, and, if it’s useful, a short, no-obligation walkthrough. No sales scripts."
            />

            <h2>Frequently asked questions</h2>
            <div className="faq">
              {FAQ.map((it) => (
                <details key={it.q}>
                  <summary>{it.q}</summary>
                  <p>{it.a}</p>
                </details>
              ))}
            </div>

            <Related
              links={[
                { href: '/payday-super-labour-hire', label: 'Payday Super for labour hire (1 July 2026)' },
                { href: '/labour-hire-licence', label: 'Labour hire licensing by state' },
                {
                  href: '/legally-defensible-timesheets-construction',
                  label: 'Legally defensible timesheets for construction',
                },
              ]}
            />

            <Sources>
              Australian Taxation Office,{' '}
              <a href="https://www.ato.gov.au/businesses-and-organisations/super-for-employers/payday-super">
                Payday Super
              </a>
              ; Fair Work Ombudsman,{' '}
              <a href="https://www.fairwork.gov.au/pay-and-wages/pay-records">Record-keeping</a> and{' '}
              <a href="https://www.fairwork.gov.au/find-help-for/labour-hire-and-supply-chains">
                Labour hire and supply chains
              </a>
              . Indicative only; confirm current requirements at the source.
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
