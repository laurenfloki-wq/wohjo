// /legally-defensible-timesheets-construction — evergreen guide.
// Owns the "legally defensible timesheet" angle via the evidentiary wedge.

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

const PATH = '/legally-defensible-timesheets-construction';
const PUBLISHED = '2026-06-24';
const MODIFIED = '2026-06-24';

export const viewport = contentViewport;

export const metadata: Metadata = buildArticleMetadata({
  title: 'Legally Defensible Timesheets for Australian Construction',
  description:
    'What makes a construction timesheet legally defensible in Australia: Fair Work record-keeping rules, tamper-evident digital trails, and verified-at-source hours.',
  path: PATH,
  published: PUBLISHED,
  modified: MODIFIED,
});

const FAQ: FaqItem[] = [
  {
    question: 'What makes a timesheet legally defensible in Australia?',
    answer:
      'A defensible timesheet is contemporaneous (captured when the work happens, not reconstructed later), accurate, complete, and verifiable by someone other than the person who entered it. Under the Fair Work Act and Fair Work Regulations, employers must keep accurate time and wages records and must not make records that are false or misleading. A record is strongest when it is tamper-evident and carries an independent confirmation of who worked, when, and for how long.',
  },
  {
    question: 'How long must construction employers keep timesheets in Australia?',
    answer:
      'Time and wages records must be kept for seven years under the Fair Work Regulations. They must be legible, in English, and not altered except to correct a genuine error. A Fair Work Inspector can require them to be produced.',
  },
  {
    question: 'Are digital timesheets acceptable to Fair Work?',
    answer:
      'Yes. Fair Work does not mandate paper. Digital records are acceptable and are generally easier to keep accurate, complete, and retrievable. The standard is the same as for paper: the record must be accurate, kept for seven years, and not false or misleading. A digital audit trail that shows when an entry was made and by whom is far harder to dispute than a paper sheet.',
  },
  {
    question: 'What happens if you cannot produce accurate time records?',
    answer:
      'If an employee makes an underpayment claim and the employer has not kept the records it was required to keep, the Fair Work Act shifts the evidentiary burden to the employer to disprove the claim. In practice, missing or unreliable records make a claim much harder to defend and much more expensive to resolve.',
  },
  {
    question: 'What does tamper-evident mean for a timesheet?',
    answer:
      'Tamper-evident means any change to a recorded hour is detectable. Once a shift is confirmed and sealed, the original figure and the fact of any later correction are both preserved, so no one can quietly overwrite a number between the site and the pay run. That is what lets a record settle a dispute rather than start one.',
  },
];

export default function Page() {
  return (
    <ArticleLayout
      crumbs={[
        { name: 'Home', path: '/' },
        { name: 'Guides', path: '/guides' },
        { name: 'Legally defensible timesheets', path: PATH },
      ]}
      eyebrow="Record-keeping · Construction & labour hire"
      title="Legally defensible timesheets for Australian construction"
      lede="A timesheet is only worth what it can prove. This is what makes a construction time record stand up — to Fair Work, to an underpayment claim, and to the worker whose hours it represents."
      published={PUBLISHED}
      modified={MODIFIED}
      schema={{
        type: 'TechArticle',
        headline: 'Legally defensible timesheets for Australian construction',
        description:
          'What makes a construction timesheet legally defensible in Australia: Fair Work record-keeping obligations, tamper-evident digital audit trails, and verified-at-source hours.',
        path: PATH,
        datePublished: PUBLISHED,
        dateModified: MODIFIED,
        about: [
          'Timesheet',
          'Fair Work record-keeping',
          'Construction labour hire',
          'Time and wages records',
        ],
        speakableSelector: ['.answer'],
      }}
      hero={
        <>
          <ShortAnswer>
            A timesheet is legally defensible when it is{' '}
            <strong>contemporaneous, accurate, complete, and independently verifiable</strong>, and
            when any later change is detectable. Australian employers must keep accurate time and
            wages records for <strong>seven years</strong> and must not make false or misleading
            records. A paper sheet or a group-chat thumbs-up rarely clears that bar; a
            tamper-evident record of who worked, when, and for how long — confirmed at the source —
            does.
          </ShortAnswer>
          <AtAGlance
            items={[
              <>
                <strong>Standard:</strong> contemporaneous, accurate, complete, verifiable.
              </>,
              <>
                <strong>Retention:</strong> seven years, legible, in English, unaltered.
              </>,
              <>
                <strong>If records fail:</strong> the burden to disprove an underpayment claim
                shifts to the employer.
              </>,
              <>
                <strong>The gap:</strong> most disputes are about whether the hours are real — not
                the arithmetic.
              </>,
            ]}
          />
        </>
      }
    >
      <h2>What does Fair Work require from a time record?</h2>
      <p>
        Under the Fair Work Act 2009 and the Fair Work Regulations, employers must make and keep
        records of the hours worked and the amounts paid. Those records must be accurate, kept for
        seven years, legible, in English, and not false or misleading. They cannot be altered except
        to correct a genuine error, and a Fair Work Inspector can require them to be produced. The
        obligation sits with the employer — for labour hire, that is the agency that pays the
        worker.
      </p>
      <p>Four qualities separate a record that protects you from one that does not:</p>
      <Checklist
        items={[
          <>
            <strong>Contemporaneous</strong> — captured when the work happens, not reconstructed
            from memory on a Monday.
          </>,
          <>
            <strong>Accurate</strong> — start, finish, and breaks reflect what actually occurred.
          </>,
          <>
            <strong>Complete</strong> — every shift for every worker, with nothing missing.
          </>,
          <>
            <strong>Verifiable</strong> — someone other than the person who entered it can confirm
            it is true.
          </>,
        ]}
      />

      <h2>Why do digital audit trails beat paper?</h2>
      <p>
        A paper timesheet records a claim: someone says these were the hours. It carries no proof of
        when it was written or whether it was changed afterward. A photographed sheet sent days
        later, or a number typed into a spreadsheet, has the same weakness. The record and the event
        it describes are not linked.
      </p>
      <p>
        A digital audit trail closes that gap. It can show when each entry was made, by whom, and
        whether it was edited — and it can do so without depending on anyone&apos;s recollection.
        That is the difference between a record you hope holds up and one that does.
      </p>

      <ComparisonTable
        caption="Paper timesheet vs verified digital record"
        columns={['', 'Paper / group chat', 'Verified digital record']}
        sealColumn={2}
        rows={[
          {
            label: 'When captured',
            cells: ['Often after the fact', 'At the point of work'],
          },
          {
            label: 'Who confirms it',
            cells: ['The person who wrote it', 'An independent approver'],
          },
          {
            label: 'Evidence of change',
            cells: ['None — overwrite leaves no trace', 'Tamper-evident; corrections preserved'],
          },
          {
            label: 'Retrieval in a dispute',
            cells: ['Hunt through files', 'Produced in seconds'],
          },
        ]}
      />

      <h2>What makes a record tamper-evident?</h2>
      <p>
        Tamper-evident does not mean a record can never be corrected — genuine errors must be
        fixable. It means a change cannot be made <em>silently</em>. Once a shift is confirmed, the
        original figure is preserved and any later correction is recorded as a correction, with its
        own timestamp and author. Nobody can quietly move a number between the site and the pay run,
        because the attempt would show.
      </p>

      <PullQuote>
        The question a tribunal asks is not &quot;what does your timesheet say?&quot; It is
        &quot;why should we believe it?&quot; A tamper-evident, independently confirmed record
        answers that before the question is asked.
      </PullQuote>

      <h2>Where do verified-at-source hours fit?</h2>
      <p>
        The strongest record is one created where the work happens and confirmed by someone with
        authority over the site. Workers confirm their hours on site; the supervisor approves the
        shift; the approved hours are sealed before they reach payroll. This is the layer{' '}
        <a href="/wles">the Workforce Ledger Evidentiary Standard (WLES)</a> describes, and it is
        what Flostruction provides. To be clear about scope:{' '}
        <strong>
          Flostruction does not calculate wages, award entitlements, tax, or superannuation.
        </strong>{' '}
        It verifies and seals the hours your payroll system starts from, so the input is not in
        dispute.
      </p>

      <h2>Is your timesheet defensible? A checklist</h2>
      <Checklist
        items={[
          'Hours are captured at the point of work, not reconstructed later.',
          'Each shift is confirmed by someone other than the person who entered it.',
          'A change to any hour is detectable, with the original preserved.',
          'Records are complete — every worker, every shift, no gaps.',
          'Records are retained for seven years and can be produced on request.',
          'The same record flows to payroll, so the paid hours match the proven hours.',
        ]}
      />

      <Cta
        heading="See verified hours before payroll."
        body="A straight conversation about whether verified-at-source hours are right for your operation. No sales scripts."
      />

      <Faq items={FAQ} />

      <Related
        links={[
          {
            href: '/payday-super-labour-hire',
            label: 'Payday Super for construction & labour hire',
          },
          {
            href: '/fair-work-worked-hour-records',
            label: 'What Fair Work expects from a worked-hour record',
          },
          { href: '/wles', label: 'The Workforce Ledger Evidentiary Standard (WLES)' },
          { href: '/#action', label: 'Book a demo' },
        ]}
      />

      <Sources>
        Fair Work Ombudsman,{' '}
        <a href="https://www.fairwork.gov.au/workplace-problems/record-keeping-and-pay-slips">
          Record-keeping and pay slips
        </a>
        ; Fair Work Act 2009 (Cth) and Fair Work Regulations 2009 (Cth).
      </Sources>
    </ArticleLayout>
  );
}
