// /fair-work-worked-hour-records — authority / reference page.
// Strong internal-link target; cites Fair Work and the ATO.

import type { Metadata } from 'next';
import { ArticleLayout } from '@/components/content/ArticleLayout';
import {
  ShortAnswer,
  AtAGlance,
  ComparisonTable,
  Checklist,
  PullQuote,
  Cta,
  Related,
  Sources,
} from '@/components/content/blocks';
import { Faq, type FaqItem } from '@/components/content/Faq';
import { buildArticleMetadata, contentViewport } from '@/lib/seo/metadata';

const PATH = '/fair-work-worked-hour-records';
const PUBLISHED = '2026-06-24';
const MODIFIED = '2026-06-24';

export const viewport = contentViewport;

export const metadata: Metadata = buildArticleMetadata({
  title: 'What Fair Work Expects From a Worked-Hour Record',
  description:
    'What Fair Work requires in a worked-hour record: which records to keep, what they must contain, the seven-year retention rule, and what happens if they are missing.',
  path: PATH,
  published: PUBLISHED,
  modified: MODIFIED,
});

const FAQ: FaqItem[] = [
  {
    question: 'What records must Australian employers keep?',
    answer:
      'Under the Fair Work Act and Fair Work Regulations, employers must keep time and wages records, including the employee’s pay rate and amounts paid, hours worked where pay varies (for example casual or irregular work, or where overtime, penalty or loading applies), leave balances and movements, and superannuation contributions. Pay slips must be issued within one working day of payday.',
  },
  {
    question: 'How long must time and wages records be kept?',
    answer:
      'Seven years. Records must be legible, in English, and not altered except to correct a genuine error. They must not be false or misleading, and they must be able to be produced if a Fair Work Inspector asks.',
  },
  {
    question: 'What must a worked-hour record contain?',
    answer:
      'For hours specifically: enough to establish the hours actually worked where that affects pay — typically start and finish times and any unpaid breaks for employees whose pay depends on hours, such as casuals or where penalties, overtime or loadings apply. The record should make clear who worked, on what day, and for how long.',
  },
  {
    question: 'Can Fair Work ask to see your time records?',
    answer:
      'Yes. A Fair Work Inspector can require an employer to produce records, and there are penalties for failing to keep them or for keeping false or misleading records. Records also underpin pay slips, which employees are entitled to receive.',
  },
  {
    question: 'What if a worked-hour record is missing or wrong?',
    answer:
      'If an employee makes an underpayment claim and the employer has not kept the records it was required to keep, the Fair Work Act places the burden on the employer to disprove the claim. Missing or unreliable records therefore make a claim both harder to defend and more costly to resolve.',
  },
];

export default function Page() {
  return (
    <ArticleLayout
      crumbs={[
        { name: 'Home', path: '/' },
        { name: 'Guides', path: '/guides' },
        { name: 'Fair Work worked-hour records', path: PATH },
      ]}
      eyebrow="Reference · Time and wages records"
      title="What Fair Work expects from a worked-hour record"
      lede="A plain-English reference for Australian employers: which records you must keep, what a worked-hour record should contain, how long to keep it, and what happens when it is not there."
      published={PUBLISHED}
      modified={MODIFIED}
      schema={{
        type: 'TechArticle',
        headline: 'What Fair Work expects from a worked-hour record',
        description:
          'A reference on Fair Work time and wages record-keeping: which records to keep, what a worked-hour record must contain, the seven-year retention rule, and the consequences of missing records.',
        path: PATH,
        datePublished: PUBLISHED,
        dateModified: MODIFIED,
        about: [
          'Fair Work record-keeping',
          'Time and wages records',
          'Worked-hour record',
          'Pay slips',
        ],
        speakableSelector: ['.answer'],
      }}
      hero={
        <>
          <ShortAnswer>
            Australian employers must keep <strong>time and wages records</strong> — including pay
            rates, amounts paid, hours worked where pay varies, leave, and superannuation — for{' '}
            <strong>seven years</strong>. Records must be accurate, legible, in English, unaltered
            except to fix genuine errors, and never false or misleading. Pay slips are due{' '}
            <strong>within one working day of payday</strong>. If required records are missing, the
            burden to disprove an underpayment claim shifts to the employer.
          </ShortAnswer>
          <AtAGlance
            items={[
              <>
                <strong>Keep:</strong> time and wages, leave, super records.
              </>,
              <>
                <strong>For:</strong> seven years, legible and unaltered.
              </>,
              <>
                <strong>Pay slips:</strong> within one working day of payday.
              </>,
              <>
                <strong>If missing:</strong> the employer must disprove the claim.
              </>,
            ]}
          />
        </>
      }
    >
      <h2>Which records must be kept?</h2>
      <p>
        The Fair Work Act 2009 and the Fair Work Regulations set out the records an employer must
        make and keep. They cover more than hours, but hours sit at the centre because so much of
        pay depends on them. The main categories:
      </p>
      <Checklist
        items={[
          'General employment records — employer and employee details, and the basis of employment.',
          'Pay records — pay rate, gross and net amounts, and any deductions or loadings.',
          'Hours records — where pay depends on hours, such as casual or irregular work, or where overtime, penalties or loadings apply.',
          'Leave records — balances and any leave taken.',
          'Superannuation records — contributions made, including amounts and fund.',
        ]}
      />

      <h2>What must a worked-hour record contain?</h2>
      <p>
        Where an employee&apos;s pay depends on the hours they work, the record needs to establish
        those hours: who worked, on which day, and for how long, including any unpaid breaks. The
        aim is simple — anyone reviewing the record later should be able to see the hours actually
        worked without guessing. For salaried staff whose pay does not vary with hours, the
        requirements are lighter, but for construction labour hire — where casual and hourly
        arrangements are common — the hours record is central.
      </p>

      <ComparisonTable
        caption="What the rules require of a record"
        columns={['Requirement', 'What it means']}
        rows={[
          { label: 'Accurate', cells: ['Reflects what actually happened'] },
          { label: 'Retained', cells: ['Kept for seven years'] },
          { label: 'Legible & in English', cells: ['Readable and producible on request'] },
          { label: 'Unaltered', cells: ['Changed only to correct a genuine error'] },
          { label: 'Not false or misleading', cells: ['No fabricated or doctored entries'] },
        ]}
      />

      <h2>How long, and who can ask to see them?</h2>
      <p>
        Records must be kept for <strong>seven years</strong>. A Fair Work Inspector can require an
        employer to produce them, and there are penalties for failing to keep records or for keeping
        records that are false or misleading. Pay slips, which draw on these records, must be given
        to employees within one working day of payday.
      </p>

      <PullQuote>
        The record is not paperwork for its own sake. It is the thing that decides who is believed
        when a pay is questioned — and the law expects the employer to have it.
      </PullQuote>

      <h2>What happens when records are missing?</h2>
      <p>
        This is the part that catches employers out. If an employee alleges an underpayment and the
        employer has not kept the records it was legally required to keep, the Fair Work Act shifts
        the burden onto the employer to disprove the allegation. Good records protect you; their
        absence works against you.
      </p>

      <h2>Where verification fits</h2>
      <p>
        Keeping records that meet this standard is far easier when the hours are confirmed at the
        source and sealed before payroll, so they cannot drift or be quietly altered. That is what{' '}
        <a href="/wles">the Workforce Ledger Evidentiary Standard (WLES)</a> describes and what
        Flostruction provides. To be clear about scope:{' '}
        <strong>
          Flostruction does not calculate wages, award entitlements, tax, or superannuation.
        </strong>{' '}
        It makes the worked-hour record verifiable; your payroll and super systems do the rest.
      </p>

      <Cta
        heading="Make your worked-hour records defensible."
        body="A straight conversation about verified hours before payroll. No sales scripts."
      />

      <Faq items={FAQ} />

      <Related
        links={[
          {
            href: '/legally-defensible-timesheets-construction',
            label: 'Legally defensible timesheets for Australian construction',
          },
          {
            href: '/labour-hire-payroll-disputes',
            label: 'Labour hire payroll and timesheet disputes',
          },
          {
            href: '/payday-super-labour-hire',
            label: 'Payday Super for construction & labour hire',
          },
          { href: '/#action', label: 'Book a demo' },
        ]}
      />

      <Sources>
        Fair Work Ombudsman,{' '}
        <a href="https://www.fairwork.gov.au/workplace-problems/record-keeping-and-pay-slips">
          Record-keeping and pay slips
        </a>
        ; Australian Taxation Office,{' '}
        <a href="https://www.ato.gov.au/businesses-and-organisations/super-for-employers">
          Super for employers
        </a>
        .
      </Sources>
    </ArticleLayout>
  );
}
