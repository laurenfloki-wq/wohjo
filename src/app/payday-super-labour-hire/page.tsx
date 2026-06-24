// /payday-super-labour-hire — the approved Payday Super guide.
//
// Copy and the four JSON-LD blocks are verbatim from the approved file
// payday-super-labour-hire.html. The styling is re-homed onto the shared
// content components and design tokens. This page emits the four approved
// schema blocks itself (see payday-schema.ts), so the shared Breadcrumbs
// renders without its auto BreadcrumbList and the FAQ is hand-rendered to
// keep the visible answers and the verbatim FAQPage schema exactly as
// approved (the source ships lightly different visible vs schema answers).

import type { Metadata } from 'next';
import '@/components/content/content.css';
import { ContentHeader, DEFAULT_DISCLAIMER } from '@/components/content/ArticleLayout';
import { Breadcrumbs } from '@/components/content/Breadcrumbs';
import { AuthorByline } from '@/components/content/AuthorByline';
import {
  ShortAnswer,
  AtAGlance,
  ComparisonTable,
  PullQuote,
  Checklist,
  Cta,
  Related,
  Sources,
} from '@/components/content/blocks';
import { JsonLd } from '@/lib/seo/jsonld';
import { buildArticleMetadata, contentViewport } from '@/lib/seo/metadata';
import { PAYDAY_SCHEMA } from './payday-schema';

export const viewport = contentViewport;

export const metadata: Metadata = buildArticleMetadata({
  title: 'Payday Super for Construction & Labour Hire: 1 July 2026 Guide',
  description:
    'Payday Super starts 1 July 2026 — super paid every pay run, received within 7 business days. For construction labour hire, hours must be verified before payroll. What changes, who it covers, and how to get ready.',
  path: '/payday-super-labour-hire',
  published: '2026-06-24',
  modified: '2026-06-24',
  ogTitle: 'Payday Super for construction & labour hire: 1 July 2026 guide',
  ogDescription:
    'Super every pay run, received within 7 business days. For labour hire, the quarter you used to fix timesheet disputes is gone. What changes and how to prepare.',
  twitterTitle: 'Payday Super for construction & labour hire (1 July 2026)',
  twitterDescription:
    'Super every pay run, received within 7 business days. For labour hire, hours must be verified before payroll.',
});

const CRUMBS = [
  { name: 'Home', path: '/' },
  { name: 'Guides', path: '/guides' },
  { name: 'Payday Super for labour hire', path: '/payday-super-labour-hire' },
];

// Visible FAQ — rendered from strings so apostrophes need no escaping.
// Answers are the approved visible copy (lightly shorter than the FAQPage
// schema answers, exactly as the approved source ships them).
const VISIBLE_FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'What is Payday Super and when does it start?',
    a: "Payday Super is a reform to the Superannuation Guarantee that starts on 1 July 2026. From that date, employers pay super at the same time as wages on every pay run rather than quarterly, and contributions must be received by the employee's fund within 7 business days of payday. It is legislated under the Treasury Laws Amendment (Payday Superannuation) Act 2025 and applies to all employers.",
  },
  {
    q: 'Does Payday Super apply to labour hire workers and contractors?',
    a: 'Yes. It applies to all employers with Superannuation Guarantee obligations, covering eligible employees and independent contractors paid mainly for their labour. For labour hire running weekly or fortnightly payroll, that means a super obligation on every run.',
  },
  {
    q: 'What is the 7 business day rule under Payday Super?',
    a: "Super contributions must be received by the employee's fund within 7 business days of payday. The clock measures to receipt, not to when you send it. Because clearing houses can take one to three business days to transmit, most providers recommend initiating payment by day four or five.",
  },
  {
    q: 'What happens if worked hours are wrong when super is paid?',
    a: 'If the hours feeding a pay run are wrong, the super calculated on them is wrong. Underpaid super can trigger the Super Guarantee Charge, which is not tax deductible and can carry penalties up to 200 percent, plus Director Penalty Notices making directors personally liable. Correcting hours after the money has moved is slower and costlier than getting them right beforehand.',
  },
  {
    q: 'Does Flostruction calculate or pay superannuation?',
    a: 'No. Flostruction does not calculate wages, award entitlements, tax, or superannuation. It verifies and seals worked hours before they reach payroll, so the hours feeding your super calculation are confirmed on site, approved by the supervisor, and not in dispute. Your payroll and super systems still do the pay and the super.',
  },
  {
    q: 'How should a labour hire business get ready for Payday Super?',
    a: 'Confirm your payroll and clearing house can pay super each run within the 7 business day window, replace the Small Business Super Clearing House before it closes on 30 June 2026 if you used it, check employee fund and member details are correct, and make sure the hours feeding each run are verified before payroll rather than reconciled afterward.',
  },
];

export default function PaydaySuperLabourHirePage() {
  return (
    <div className="flos-article">
      {/* Four approved JSON-LD blocks, each its own <script>, verbatim. */}
      {PAYDAY_SCHEMA.map((block, i) => (
        <JsonLd key={i} data={block} />
      ))}

      <ContentHeader />

      <main id="main" tabIndex={-1}>
        <div className="wrap">
          <Breadcrumbs crumbs={CRUMBS} schema={false} />
        </div>

        <div className="hero">
          <div className="wrap">
            <p className="eyebrow">Payday Super · 1 July 2026 · Construction &amp; labour hire</p>
            <h1>
              Payday Super and labour hire: verified hours have to be right before every pay run.
            </h1>
            <p className="lede">
              From 1 July 2026, super is paid on every pay run — not every quarter. For construction
              labour hire, that removes the window you used to fix timesheet disputes. The hours
              have to be right going in.
            </p>

            <AuthorByline published="2026-06-24" modified="2026-06-24" />

            <ShortAnswer>
              Payday Super starts <strong>1 July 2026</strong>. Australian employers must pay
              superannuation at the same time as wages on every pay run, and contributions must
              reach the employee&apos;s fund <strong>within 7 business days of payday</strong>. It
              applies to all employers, including for contractors paid mainly for their labour. For
              labour hire running weekly or fortnightly, the quarterly buffer that once absorbed
              timesheet corrections is gone — hours now need to be{' '}
              <strong>verified and sealed before payroll</strong>, not reconciled afterward.
            </ShortAnswer>

            <AtAGlance
              items={[
                <>
                  <strong>Starts:</strong> 1 July 2026, every employer, no phase-in.
                </>,
                <>
                  <strong>Rule:</strong> super paid each pay run; received by the fund within 7
                  business days of payday.
                </>,
                <>
                  <strong>Rate:</strong> 12 percent, now on qualifying earnings (QE) — a broader
                  base than OTE.
                </>,
                <>
                  <strong>Risk for labour hire:</strong> weekly runs mean weekly super exposure,
                  with days — not a quarter — to get hours right.
                </>,
              ]}
            />
          </div>
        </div>

        <article>
          <div className="wrap">
            <h2>What changes on 1 July 2026</h2>
            <p>
              Payday Super is the most significant change to the Superannuation Guarantee since it
              began in 1992. It is legislated under the{' '}
              <em>Treasury Laws Amendment (Payday Superannuation) Act 2025</em> and applies to every
              Australian employer, regardless of size, with no phase-in. The mechanics are simple;
              the operational impact is not.
            </p>

            <ComparisonTable
              caption="Quarterly super vs Payday Super"
              columns={['', 'Until 30 June 2026', 'From 1 July 2026']}
              sealColumn={2}
              rows={[
                {
                  label: 'Payment frequency',
                  cells: ['Quarterly — 4 times a year', 'Every pay run, with wages'],
                },
                {
                  label: 'Deadline',
                  cells: [
                    '28 days after quarter end',
                    'Received by fund within 7 business days of payday',
                  ],
                },
                {
                  label: 'Calculation base',
                  cells: ['Ordinary time earnings (OTE)', 'Qualifying earnings (QE) — broader'],
                },
                {
                  label: 'Window to fix hour disputes',
                  cells: ['Up to a quarter', 'Days'],
                },
                {
                  label: 'If you fall short',
                  cells: [
                    'Super Guarantee Charge',
                    'SGC rebuilt — up to 200%, not deductible, Director Penalty Notices',
                  ],
                },
              ]}
            />

            <h2>Does Payday Super apply to labour hire and contractors?</h2>
            <p>
              Yes. Payday Super applies to every employer with Superannuation Guarantee obligations,
              and those obligations cover eligible employees as well as independent contractors paid
              mainly for their labour — a common arrangement across construction labour hire. If you
              pay super for a worker today, you pay it on payday from 1 July 2026.
            </p>

            <h2>Why this lands harder on labour hire</h2>
            <p>
              Most labour hire businesses run weekly or fortnightly payroll. Under the old quarterly
              system, a wrong timesheet, a disputed shift, or a supervisor sign-off that never
              landed could be fixed before the next quarterly deadline. There was slack in the
              system.
            </p>
            <p>
              Payday Super removes that slack. Every pay run is now a super event with a hard 7
              business day clock. Weekly runs mean <strong>weekly exposure</strong>. And because the
              7 days is measured to when the fund <em>receives</em> the money — and clearing houses
              can take one to three business days to transmit — the practical window to get
              everything right is tighter than it looks.
            </p>

            <PullQuote>
              The problem was never the super calculation. It is the number going into it. If the
              hours are wrong, the super is wrong — and now you find out every week.
            </PullQuote>

            <h2>The 7 business day rule, in practice</h2>
            <p>
              The contribution must be received by the employee&apos;s fund within 7 business days
              of payday, not merely sent. SuperStream transmission through a clearing house
              typically takes one to three business days, so initiating payment on day six and
              assuming you have complied is how employers end up liable. Most payroll providers now
              recommend a day four or five internal cut-off to build in a buffer. The Small Business
              Super Clearing House, which many small operators relied on, closed to new users in
              October 2025 and shuts entirely on 30 June 2026 — if you used it, you need a
              SuperStream-compliant replacement before 1 July.
            </p>

            <h2>The real risk: wrong hours in, wrong super out</h2>
            <p>
              Super is calculated on paid earnings, and paid earnings come from worked hours. When
              those hours arrive as paper timesheets, a thumbs-up in a group chat, or an approval no
              one can stand behind, every error flows straight through to the super you owe.
            </p>
            <p>
              Underpay, and you are exposed to the Super Guarantee Charge — unpaid super plus
              notional earnings plus an administrative uplift, not tax deductible, with penalties
              that can reach 200 percent and Director Penalty Notices that reach the people who run
              the business. Pay on disputed hours, and you are clawing money back after it has left.
              Under a quarterly cycle you had time to catch these. Under Payday Super you have a
              week.
            </p>

            <h2>What &quot;ready&quot; actually looks like</h2>
            <p>
              Most readiness advice focuses downstream: your clearing house, your STP reporting,
              your cash flow timing. That work matters and you should do it. But it all assumes the
              hours feeding payroll are already correct — and for labour hire, that assumption is
              the weakest link. Being genuinely ready means the input is clean before each run:
            </p>
            <Checklist
              items={[
                'Worked hours are captured at the point of work, not reconstructed from memory on a Monday.',
                'Every shift is approved by the site supervisor before it reaches payroll — confirmed, not assumed.',
                'Approved hours are locked, so a number cannot quietly change between the site and the pay run.',
                'If a dispute arises, there is a record that settles it in seconds rather than an argument that delays the run.',
              ]}
            />

            <h2>Where Flostruction fits</h2>
            <p>
              Flostruction is the verification layer that sits in front of payroll. Workers clock on
              at the job. The site supervisor approves the shift by SMS — one text, no app to learn.
              Each approved shift is sealed into a permanent, tamper-evident record under the{' '}
              <a href="/wles">Workforce Ledger Evidentiary Standard (WLES)</a>, then exported clean
              to your payroll.
            </p>
            <p>
              To be clear about scope:{' '}
              <strong>
                Flostruction does not calculate wages, award entitlements, tax, or superannuation.
              </strong>{' '}
              Your payroll and super systems still do the pay and the super. What Flostruction does
              is make sure the hours those systems start from are confirmed on site, approved, and
              not in dispute — so every pay run, and every super contribution calculated from it,
              starts from records nobody argues with.
            </p>
            <p className="muted">
              In a world of weekly super deadlines, the cheapest place to remove risk is the
              earliest one: the hours.
            </p>

            <Cta
              heading="See it before 1 July."
              body="A straight conversation about whether verified hours before payroll is right for your operation. No sales scripts."
            />

            <h2>Frequently asked questions</h2>
            <div className="faq">
              {VISIBLE_FAQ.map((it) => (
                <details key={it.q}>
                  <summary>{it.q}</summary>
                  <p>{it.a}</p>
                </details>
              ))}
            </div>

            <Related
              links={[
                {
                  href: '/wles',
                  label: 'The Workforce Ledger Evidentiary Standard (WLES)',
                },
                {
                  href: '/#how',
                  label: 'How Flostruction works — clock on, approve by SMS, sealed',
                },
                { href: '/#action', label: 'Book a demo' },
              ]}
            />

            <Sources>
              Australian Taxation Office,{' '}
              <a href="https://www.ato.gov.au/businesses-and-organisations/super-for-employers/payday-super">
                Payday Super
              </a>
              ; Fair Work Ombudsman,{' '}
              <a href="https://www.fairwork.gov.au/newsroom/news/payday-super-new-rules-starting-1-july-2026">
                Payday Super: new rules starting 1 July 2026
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
