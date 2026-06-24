// /labour-hire-payroll-disputes — pain-led guide on preventing and
// resolving labour hire payroll and timesheet disputes.

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

const PATH = '/labour-hire-payroll-disputes';
const PUBLISHED = '2026-06-24';
const MODIFIED = '2026-06-24';

export const viewport = contentViewport;

export const metadata: Metadata = buildArticleMetadata({
  title: 'Labour Hire Payroll Disputes: Prevent and Resolve Fast',
  description:
    'How labour hire payroll and timesheet disputes start, who pays when hours cannot be proven, and how a sealed evidentiary record settles them in seconds, not days.',
  path: PATH,
  published: PUBLISHED,
  modified: MODIFIED,
});

const FAQ: FaqItem[] = [
  {
    question: 'How do labour hire payroll disputes usually start?',
    answer:
      'Most start at the input, not the calculation. A paper timesheet goes missing, a supervisor approves shifts by a thumbs-up in a group chat that no one can later find, a worker says they did ten hours and the host site says eight. By the time payroll runs, the only record is a claim no one can stand behind, and the disagreement surfaces in the pay.',
  },
  {
    question: 'Who pays when worked hours cannot be proven?',
    answer:
      'The labour hire business usually does. If a worker makes an underpayment claim and the employer has not kept the records it was required to keep, the Fair Work Act shifts the burden to the employer to disprove the claim. Without a reliable record, that is hard — so the practical choice is often to pay the disputed amount, absorb the cost, and lose time on every run it happens.',
  },
  {
    question: 'How do you prove worked hours in a dispute?',
    answer:
      'You prove them with a record made when the work happened and confirmed by someone independent of the worker — typically the site supervisor — that cannot have been altered afterward. A contemporaneous, approved, tamper-evident record answers who worked, when, and for how long without relying on anyone’s memory.',
  },
  {
    question: 'How can a sealed record settle a timesheet dispute quickly?',
    answer:
      'When each shift is confirmed on site and sealed before payroll, a dispute is resolved by retrieving the record rather than reconstructing the week. The original hours and any correction are both preserved, so there is a single source of truth to point to. What used to be an argument that delayed the pay run becomes a lookup that takes seconds.',
  },
  {
    question: 'Does Flostruction resolve disputes or calculate pay for me?',
    answer:
      'No. Flostruction does not calculate wages, award entitlements, tax, or superannuation. It verifies and seals worked hours before they reach payroll, so the hours your payroll system starts from are confirmed and not in dispute. It removes the cause of most disputes; your payroll and any dispute process still sit with you.',
  },
];

export default function Page() {
  return (
    <ArticleLayout
      crumbs={[
        { name: 'Home', path: '/' },
        { name: 'Guides', path: '/guides' },
        { name: 'Labour hire payroll disputes', path: PATH },
      ]}
      eyebrow="Disputes · Labour hire payroll"
      title="Labour hire payroll and timesheet disputes: prevent and resolve"
      lede="Every disputed pay run costs money, time, and trust. Almost all of it traces back to one thing: hours nobody can stand behind. Here is how disputes start, who carries the cost, and how to end them at the source."
      published={PUBLISHED}
      modified={MODIFIED}
      schema={{
        type: 'Article',
        headline: 'Labour hire payroll and timesheet disputes: prevent and resolve',
        description:
          'Why labour hire payroll and timesheet disputes start, who pays when worked hours cannot be proven, and how a sealed evidentiary record settles them quickly.',
        path: PATH,
        datePublished: PUBLISHED,
        dateModified: MODIFIED,
        about: ['Payroll dispute', 'Timesheet dispute', 'Labour hire', 'Proof of worked hours'],
        speakableSelector: ['.answer'],
      }}
      hero={
        <>
          <ShortAnswer>
            Labour hire payroll disputes almost always start at the <strong>input</strong>, not the
            calculation: a missing paper timesheet, a group-chat approval no one can find, a
            sign-off that never landed. When hours cannot be proven, the{' '}
            <strong>cost usually falls on the labour hire business</strong> — and if records were
            not kept, the burden to disprove an underpayment claim shifts to the employer. The fix
            is to capture and confirm hours at the source and{' '}
            <strong>seal them before payroll</strong>, so a dispute is a lookup, not an argument.
          </ShortAnswer>
          <AtAGlance
            items={[
              <>
                <strong>Where they start:</strong> paper, group chats, vanished approvals.
              </>,
              <>
                <strong>Who pays:</strong> usually the agency that ran the pay.
              </>,
              <>
                <strong>Why it sticks:</strong> no reliable record to point to.
              </>,
              <>
                <strong>The fix:</strong> confirmed, sealed hours before payroll.
              </>,
            ]}
          />
        </>
      }
    >
      <h2>How does a dispute actually begin?</h2>
      <p>
        It rarely begins at payroll. It begins on a Tuesday, on a site, when a shift is recorded
        loosely or not at all. The supervisor is busy; the approval is a thumbs-up in a thread; the
        worker writes their hours on a sheet that goes home in a ute. Days later, payroll needs a
        number, and three people remember three different things. The pay run becomes the place
        where a week of small ambiguities collide.
      </p>
      <p>The usual ingredients:</p>
      <Checklist
        items={[
          'Hours reconstructed from memory instead of captured when worked.',
          'Approvals scattered across group chats, with no single source.',
          'Sign-offs that were given verbally and never recorded.',
          'A host site whose count differs from the worker’s.',
          'Edits to a timesheet that leave no trace of what changed.',
        ]}
      />

      <h2>Who carries the cost?</h2>
      <p>
        In labour hire, the business that pays the worker carries the obligation to keep accurate
        records. When a disagreement reaches a claim and the records are missing or unreliable, the
        Fair Work Act shifts the burden to the employer to disprove the allegation. Practically,
        that means the choice is often to pay the disputed hours and move on — every time it
        happens. The direct cost is the overpayment; the larger cost is the time, the rework, and
        the erosion of trust with both the worker and the host.
      </p>

      <PullQuote>
        The expensive part of a dispute is not the hour in question. It is that you cannot prove the
        hour either way — so you pay, and you pay again next week.
      </PullQuote>

      <h2>What does it take to end them?</h2>
      <p>
        A dispute cannot survive a record that is contemporaneous, independently confirmed, and
        tamper-evident. If the hours were captured on site, approved by the supervisor, and sealed
        before payroll, then resolving a question means retrieving the record — not relitigating the
        week.
      </p>

      <ComparisonTable
        caption="A disputed week, two ways"
        columns={['', 'Reconstructed after the fact', 'Confirmed and sealed at the source']}
        sealColumn={2}
        rows={[
          {
            label: 'Where the record lives',
            cells: ['Memory, paper, chat threads', 'One sealed record per shift'],
          },
          { label: 'Who confirmed the hours', cells: ['Unclear', 'The site supervisor'] },
          { label: 'Resolving a question', cells: ['Reconstruct the week', 'Retrieve the record'] },
          {
            label: 'Typical outcome',
            cells: ['Pay the disputed amount', 'Settle on the evidence'],
          },
        ]}
      />

      <h2>Where Flostruction fits</h2>
      <p>
        Flostruction is the verification layer in front of payroll. Workers confirm their hours on
        site; the supervisor approves the shift by SMS; each approved shift is sealed into a
        permanent, tamper-evident record under{' '}
        <a href="/wles">the Workforce Ledger Evidentiary Standard (WLES)</a>, then exported clean to
        payroll. It does not calculate wages, award entitlements, tax, or superannuation — it
        removes the ambiguity that starts the dispute, so the hours feeding the pay run are not in
        question.
      </p>

      <Cta
        heading="Stop paying for hours you can't prove."
        body="A straight conversation about removing disputes at the source. No sales scripts."
      />

      <Faq items={FAQ} />

      <Related
        links={[
          {
            href: '/legally-defensible-timesheets-construction',
            label: 'Legally defensible timesheets for Australian construction',
          },
          {
            href: '/payday-super-labour-hire',
            label: 'Payday Super for construction & labour hire',
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
        ; Fair Work Act 2009 (Cth).
      </Sources>
    </ArticleLayout>
  );
}
