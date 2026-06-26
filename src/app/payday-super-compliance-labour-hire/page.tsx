// /payday-super-compliance-labour-hire — Payday Super answer page.
// Time-critical: live and indexed before the 1 July 2026 commencement.

import type { Metadata } from 'next';
import { ArticleLayout } from '@/components/content/ArticleLayout';
import { ShortAnswer, Checklist, Related, Sources } from '@/components/content/blocks';
import { Faq, type FaqItem } from '@/components/content/Faq';
import { buildArticleMetadata, contentViewport } from '@/lib/seo/metadata';

const PATH = '/payday-super-compliance-labour-hire';
const PUBLISHED = '2026-06-26';
const MODIFIED = '2026-06-26';

export const viewport = contentViewport;

export const metadata: Metadata = buildArticleMetadata({
  title: 'How Do Labour Hire Firms Comply With Payday Super?',
  description:
    'A practical Payday Super compliance checklist for labour hire from 1 July 2026: pay each run within 7 business days, replace the SBSCH, verify member details and hours.',
  path: PATH,
  published: PUBLISHED,
  modified: MODIFIED,
});

const FAQ: FaqItem[] = [
  {
    question: 'How do labour hire firms comply with Payday Super?',
    answer:
      'Confirm your payroll and clearing house can pay super each run so the fund receives it within 7 business days of payday; replace the Small Business Super Clearing House before it closes on 30 June 2026 if you used it; check employee fund and member details are correct; and make sure the hours feeding each run are verified before payroll rather than reconciled afterward.',
  },
  {
    question: 'Is the Small Business Super Clearing House closing?',
    answer:
      'Yes. The Small Business Super Clearing House, which many small operators relied on, is closing — it closed to new users in October 2025 and shuts entirely on 30 June 2026. If you used it, you need a SuperStream-compliant replacement before 1 July 2026.',
  },
  {
    question: 'What is the 7 business day rule?',
    answer:
      'From 1 July 2026, super contributions must be received by the employee’s fund within 7 business days of payday — measured to receipt, not to when you send it. Because clearing houses can take one to three business days to transmit, most providers recommend initiating payment by day four or five.',
  },
  {
    question: 'Does Flostruction handle Payday Super compliance?',
    answer:
      'No. Flostruction does not calculate wages, award entitlements, tax, or superannuation. It verifies and seals worked hours before they reach payroll, so the hours your payroll and super systems start from are confirmed and not in dispute. The pay run and the super remain with your payroll and clearing house.',
  },
];

export default function Page() {
  return (
    <ArticleLayout
      crumbs={[
        { name: 'Home', path: '/' },
        { name: 'Guides', path: '/guides' },
        { name: 'Payday Super compliance for labour hire', path: PATH },
      ]}
      eyebrow="Payday Super · 1 July 2026 · Compliance"
      title="How do labour hire firms comply with Payday Super?"
      lede="The practical checklist for 1 July 2026 — the clearing-house deadline, the 7 business day window, and the input most readiness advice skips."
      published={PUBLISHED}
      modified={MODIFIED}
      schema={{
        type: 'TechArticle',
        headline: 'How do labour hire firms comply with Payday Super?',
        description:
          'A Payday Super compliance checklist for labour hire from 1 July 2026: the 7 business day rule, the SBSCH closure, member details, and verified hours before payroll.',
        path: PATH,
        datePublished: PUBLISHED,
        dateModified: MODIFIED,
        about: ['Payday Super', 'Compliance', 'Labour hire', 'Superannuation Guarantee'],
        speakableSelector: ['h1', '.answer'],
      }}
      hero={
        <ShortAnswer>
          To comply from <strong>1 July 2026</strong>: pay super on every pay run so the fund
          receives it <strong>within 7 business days of payday</strong>; confirm your payroll and
          clearing house can meet that window (the Small Business Super Clearing House closes 30
          June 2026); check employee fund and member details; and make sure the hours feeding each
          run are <strong>verified before payroll</strong> — the super is only as right as the
          hours.
        </ShortAnswer>
      }
    >
      <h2>The Payday Super compliance checklist</h2>
      <Checklist
        items={[
          'Confirm your payroll and clearing house can pay super each run within the 7 business day window.',
          'Replace the Small Business Super Clearing House before it closes on 30 June 2026 if you used it — with a SuperStream-compliant alternative.',
          'Check employee fund and member details are correct, so contributions are not rejected and delayed.',
          'Verify the hours feeding each run before payroll, rather than reconciling them afterward.',
        ]}
      />

      <h2>Why the clearing-house timing is the trap</h2>
      <p>
        The 7 days is measured to when the fund receives the money, not when you send it.
        SuperStream transmission through a clearing house typically takes one to three business
        days, so initiating payment on day six and assuming you have complied is how employers end
        up liable. Most payroll providers now recommend a day four or five internal cut-off to build
        in a buffer.
      </p>

      <h2>The input most readiness advice skips</h2>
      <p className="pull">
        Clearing house, STP reporting, cash-flow timing — all of it assumes the hours feeding
        payroll are already correct. For labour hire, that assumption is the weakest link. The{' '}
        <a href="/fair-work-worked-hour-records">record of the hours</a> is where a wrong super
        contribution begins.
      </p>
      <p>
        The <a href="/wles">Workforce Ledger Evidentiary Standard (WLES)</a> closes that gap: hours
        verified at the point of work, approved by the supervisor, and sealed into a tamper-evident
        record before payroll — so every super contribution calculated from them starts from records
        nobody argues with.
      </p>

      <Faq items={FAQ} heading="Payday Super compliance: FAQ" />

      <Related
        links={[
          {
            href: '/payday-super-labour-hire',
            label: 'Payday Super for construction & labour hire',
          },
          {
            href: '/how-payday-super-affects-labour-hire',
            label: 'How Payday Super affects labour hire',
          },
          {
            href: '/payday-super-record-keeping',
            label: 'Payday Super record-keeping requirements',
          },
          { href: '/wles', label: 'The Workforce Ledger Evidentiary Standard (WLES)' },
        ]}
      />

      <Sources>
        Australian Taxation Office,{' '}
        <a href="https://www.ato.gov.au/businesses-and-organisations/super-for-employers/payday-super">
          Payday Super
        </a>
        ; Australian Taxation Office,{' '}
        <a href="https://www.ato.gov.au/businesses-and-organisations/super-for-employers/paying-super-contributions/how-to-pay-super/small-business-superannuation-clearing-house">
          Small Business Superannuation Clearing House
        </a>
        .
      </Sources>
    </ArticleLayout>
  );
}
