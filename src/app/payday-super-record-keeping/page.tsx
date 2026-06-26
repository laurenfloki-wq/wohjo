// /payday-super-record-keeping — Payday Super answer page.
// Time-critical: live and indexed before the 1 July 2026 commencement.

import type { Metadata } from 'next';
import { ArticleLayout } from '@/components/content/ArticleLayout';
import { ShortAnswer, Checklist, Related, Sources } from '@/components/content/blocks';
import { Faq, type FaqItem } from '@/components/content/Faq';
import { buildArticleMetadata, contentViewport } from '@/lib/seo/metadata';

const PATH = '/payday-super-record-keeping';
const PUBLISHED = '2026-06-26';
const MODIFIED = '2026-06-26';

export const viewport = contentViewport;

export const metadata: Metadata = buildArticleMetadata({
  title: 'Payday Super Record-Keeping Requirements',
  description:
    'What records Payday Super requires from 1 July 2026: accurate time, wages and super records kept seven years — now right every pay run, not reconciled each quarter.',
  path: PATH,
  published: PUBLISHED,
  modified: MODIFIED,
});

const FAQ: FaqItem[] = [
  {
    question: 'What records do I need for Payday Super?',
    answer:
      'Payday Super does not create a separate record set. You must still keep the time and wages and superannuation records required under the Fair Work Act and Fair Work Regulations — pay rates, amounts paid, hours worked where pay varies, and superannuation contributions. What changes is timing: those records must be correct every pay run, because super is now paid every run.',
  },
  {
    question: 'How long must super and pay records be kept?',
    answer:
      'Seven years under the Fair Work Regulations. Records must be accurate, legible, in English, and not altered except to correct a genuine error, and they must be able to be produced if a Fair Work Inspector asks.',
  },
  {
    question: 'Why does record-keeping matter more under Payday Super?',
    answer:
      'Because the window to fix an error shrinks from a quarter to days. Super is calculated on paid earnings, which come from worked hours; if the hours are wrong the super is wrong, and you now find out — and must correct it — every pay run rather than once a quarter.',
  },
  {
    question: 'What happens if records are missing or wrong?',
    answer:
      'If an employee makes an underpayment claim and the employer has not kept the records it was required to keep, the Fair Work Act places the burden on the employer to disprove the claim. Underpaid super can also trigger the Super Guarantee Charge, which is not tax deductible.',
  },
];

export default function Page() {
  return (
    <ArticleLayout
      crumbs={[
        { name: 'Home', path: '/' },
        { name: 'Guides', path: '/guides' },
        { name: 'Payday Super record-keeping', path: PATH },
      ]}
      eyebrow="Payday Super · 1 July 2026 · Record-keeping"
      title="What are the Payday Super record-keeping requirements?"
      lede="Payday Super does not add a new record set — it shortens the time you have to get the existing ones right."
      published={PUBLISHED}
      modified={MODIFIED}
      schema={{
        type: 'TechArticle',
        headline: 'What are the Payday Super record-keeping requirements?',
        description:
          'Payday Super record-keeping from 1 July 2026: the time, wages and super records to keep, the seven-year rule, and why they must be right every pay run.',
        path: PATH,
        datePublished: PUBLISHED,
        dateModified: MODIFIED,
        about: [
          'Payday Super',
          'Record-keeping',
          'Superannuation Guarantee',
          'Fair Work record-keeping',
        ],
        speakableSelector: ['h1', '.answer'],
      }}
      hero={
        <ShortAnswer>
          Payday Super does not introduce a separate record set — it raises the stakes on the
          records you already must keep. Super is calculated on paid earnings, which come from
          worked hours, so under the Fair Work Act you must keep accurate time, wages and
          superannuation records for <strong>seven years</strong>; from 1 July 2026 they must be
          right <strong>every pay run</strong>, not reconciled each quarter.
        </ShortAnswer>
      }
    >
      <h2>Which records must be kept?</h2>
      <p>
        The Fair Work Act 2009 and the Fair Work Regulations set the record-keeping obligations that
        underpin Payday Super. The records most relevant to getting super right are:
      </p>
      <Checklist
        items={[
          'Hours worked, where pay depends on them — start, finish and unpaid breaks for casual or irregular work, or where penalties, overtime or loadings apply.',
          'Pay records — pay rate, gross and net amounts, and any deductions or loadings.',
          'Superannuation records — contributions made, including amounts and fund.',
          'Records kept for seven years, legible, in English, and unaltered except to fix a genuine error.',
        ]}
      />

      <h2>What Payday Super changes about timing</h2>
      <p>
        The obligations above are not new; the cadence is. Super is now paid every run and must be
        received by the fund within 7 business days of payday, so an error in the hours flows into
        the super that same week. Under the quarterly system you had up to a quarter to catch it.
        Under Payday Super you have days.
      </p>

      <h2>Get the hours right before they reach payroll</h2>
      <p className="pull">
        The records obligation is easiest to meet when the hours are correct before they enter
        payroll. A <a href="/fair-work-worked-hour-records">worked-hour record</a> that is captured
        at the source and cannot be quietly altered is one you do not have to reconstruct under a
        seven-day clock.
      </p>
      <p>
        That is what the <a href="/wles">Workforce Ledger Evidentiary Standard (WLES)</a> describes:
        hours verified on site, approved by the supervisor, and sealed into a tamper-evident record
        before payroll. Flostruction does not calculate wages, award entitlements, tax, or
        superannuation — your payroll and super systems do, starting from records that are not in
        dispute.
      </p>

      <Faq items={FAQ} heading="Payday Super record-keeping: FAQ" />

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
            href: '/fair-work-worked-hour-records',
            label: 'What Fair Work expects from a worked-hour record',
          },
          { href: '/wles', label: 'The Workforce Ledger Evidentiary Standard (WLES)' },
        ]}
      />

      <Sources>
        Australian Taxation Office,{' '}
        <a href="https://www.ato.gov.au/businesses-and-organisations/super-for-employers/payday-super">
          Payday Super
        </a>
        ; Fair Work Ombudsman,{' '}
        <a href="https://www.fairwork.gov.au/workplace-problems/record-keeping-and-pay-slips">
          Record-keeping and pay slips
        </a>
        .
      </Sources>
    </ArticleLayout>
  );
}
