// /who-pays-unproven-labour-hire-hours — answer page on who bears the cost,
// and the legal burden of proof, when worked hours cannot be proven.

import type { Metadata } from 'next';
import { ArticleLayout } from '@/components/content/ArticleLayout';
import {
  ShortAnswer,
  AtAGlance,
  Checklist,
  PullQuote,
  Related,
  Sources,
} from '@/components/content/blocks';
import { Faq, type FaqItem } from '@/components/content/Faq';
import { buildArticleMetadata, contentViewport } from '@/lib/seo/metadata';

const PATH = '/who-pays-unproven-labour-hire-hours';
const PUBLISHED = '2026-06-27';
const MODIFIED = '2026-06-27';

export const viewport = contentViewport;

export const metadata: Metadata = buildArticleMetadata({
  title: 'Who Pays When Labour Hire Hours Can’t Be Proven?',
  description:
    'When worked hours cannot be proven, the cost usually falls on the labour hire employer — and under the Fair Work Act the burden to disprove an underpayment claim shifts to the employer that did not keep records.',
  path: PATH,
  published: PUBLISHED,
  modified: MODIFIED,
});

const FAQ: FaqItem[] = [
  {
    question: 'Who pays when labour hire worked hours cannot be proven?',
    answer:
      'The labour hire business that employed and paid the worker usually carries the cost. It holds the record-keeping obligation, so when hours are disputed and no reliable record exists, it is the party that absorbs the disputed amount, the rework, and the time lost on the pay run.',
  },
  {
    question: 'Does the burden of proof shift to the employer?',
    answer:
      'Yes. Under section 557C of the Fair Work Act 2009, if an employer was required to keep a record or issue a pay slip and did not, and a worker makes an underpayment claim in a court proceeding, the employer carries the burden of disproving the claim unless it has a reasonable excuse. Missing or unreliable records make that burden very hard to discharge.',
  },
  {
    question: 'Is the host business or the labour hire agency liable?',
    answer:
      'The labour hire agency is ordinarily the legal employer and holds the Fair Work record-keeping and payment obligations. Host businesses can carry their own exposure — for example accessorial liability if they were knowingly involved in a contravention — but the record of worked hours, and the cost of not being able to prove it, sits with the agency that ran the pay.',
  },
  {
    question: 'How do you avoid paying for hours you cannot prove?',
    answer:
      'Capture each shift when it happens, have it confirmed by someone independent of the worker — typically the site supervisor — and seal it into a tamper-evident record before payroll. Then a challenge is answered by retrieving the record rather than by paying the disputed amount to make it go away.',
  },
];

export default function Page() {
  return (
    <ArticleLayout
      crumbs={[
        { name: 'Home', path: '/' },
        { name: 'Guides', path: '/guides' },
        { name: 'Who pays for unproven hours', path: PATH },
      ]}
      eyebrow="Liability · Labour hire · Burden of proof"
      title="Who pays when labour hire hours can’t be proven?"
      lede="When a worked hour is disputed and no record can settle it, someone absorbs the cost. In labour hire, that someone is almost always the agency — and the law makes the reason explicit."
      published={PUBLISHED}
      modified={MODIFIED}
      schema={{
        type: 'TechArticle',
        headline: 'Who pays when labour hire hours can’t be proven?',
        description:
          'Who bears the cost when worked hours cannot be proven in labour hire, and how the Fair Work Act shifts the burden of proof to an employer that did not keep records.',
        path: PATH,
        datePublished: PUBLISHED,
        dateModified: MODIFIED,
        about: [
          'Labour hire',
          'Burden of proof',
          'Fair Work Act',
          'Underpayment',
          'Record keeping',
        ],
        speakableSelector: ['h1', '.answer'],
      }}
      hero={
        <>
          <ShortAnswer>
            The <strong>labour hire business usually pays</strong>. As the legal employer it holds
            the record-keeping obligation, so when hours are disputed and no reliable record exists
            it absorbs the cost. The law sharpens this: under{' '}
            <strong>section 557C of the Fair Work Act 2009</strong>, an employer that failed to keep
            the required records carries the <strong>burden of disproving</strong> an underpayment
            claim. Without a record, that burden is close to impossible to meet — so the practical
            outcome is to pay.
          </ShortAnswer>
          <AtAGlance
            items={[
              <>
                <strong>Who pays:</strong> the agency that employed and paid the worker.
              </>,
              <>
                <strong>Why:</strong> it holds the Fair Work record-keeping obligation.
              </>,
              <>
                <strong>The legal twist:</strong> s 557C reverses the onus when records are missing.
              </>,
              <>
                <strong>The fix:</strong> a confirmed, sealed record made before payroll.
              </>,
            ]}
          />
        </>
      }
    >
      <h2>Why the cost lands on the agency</h2>
      <p>
        In a labour hire arrangement the agency is ordinarily the legal employer: it engages the
        worker, runs the payroll, and carries the Fair Work obligations that come with employment —
        including the obligation to make and keep accurate records of the hours worked. The host
        business directs the work, but the record of what was worked, and the duty to be able to
        produce it, sits with the agency.
      </p>
      <p>
        So when a worker says they did ten hours and the only counter-record is a host site’s
        recollection of eight, the disagreement does not land on the host. It lands on the pay run,
        and the party that has to resolve it is the one that paid the wage.
      </p>

      <h2>The burden of proof actually reverses</h2>
      <p>
        This is the part many operators do not realise until it matters. Ordinarily a person making
        a claim has to prove it. Section 557C of the Fair Work Act 2009 changes that for worked
        hours: where an employer was required to keep a record or issue a pay slip and did not, and
        a worker brings an underpayment claim in a court proceeding, the <em>employer</em> bears the
        burden of disproving the allegation — unless it has a reasonable excuse.
      </p>
      <PullQuote>
        No record is not a neutral position. It moves the onus onto you, and then asks you to
        disprove a claim you have nothing to disprove it with.
      </PullQuote>
      <p>The practical effect, run after run:</p>
      <Checklist
        items={[
          'A worker claims hours you cannot confirm or deny from your records.',
          'Because the record was never kept, the onus is on you to disprove the claim.',
          'With nothing reliable to point to, the safe commercial choice is to pay it.',
          'The same gap reopens on the next pay run, and the next.',
        ]}
      />

      <h2>What a defensible record changes</h2>
      <p>
        The cost is not really the disputed hour. It is that the hour cannot be proven either way,
        so paying is cheaper than fighting. A record that is contemporaneous, independently
        confirmed, and tamper-evident removes that asymmetry: the burden under s 557C only bites
        when records were not kept, and a disputed hour answered by a sealed record is settled on
        evidence rather than absorbed.
      </p>

      <h2>Where Flostruction fits</h2>
      <p className="pull">
        A licence or a payroll system says nothing about whether your{' '}
        <a href="/fair-work-worked-hour-records">record of the hours</a> will hold up when a pay run
        is challenged. That is the gap this closes.
      </p>
      <p>
        Flostruction is the verification layer in front of payroll: workers confirm hours on site,
        the supervisor approves the shift, and each approved shift is sealed into a tamper-evident
        record under <a href="/wles">the Workforce Ledger Evidentiary Standard (WLES)</a> before the
        hours reach payroll. It does not calculate wages, award entitlements, tax, or superannuation
        — it makes the hours those systems start from provable, so the question of who pays for an
        unprovable hour stops arising.
      </p>

      <Faq items={FAQ} heading="Who pays for unproven hours: FAQ" />

      <Related
        links={[
          {
            href: '/labour-hire-payroll-disputes',
            label: 'Labour hire payroll and timesheet disputes',
          },
          {
            href: '/tamper-evident-timesheets',
            label: 'What makes a timesheet tamper-evident?',
          },
          {
            href: '/fair-work-worked-hour-records',
            label: 'What Fair Work expects from a worked-hour record',
          },
          { href: '/wles', label: 'The Workforce Ledger Evidentiary Standard (WLES)' },
        ]}
      />

      <Sources>
        Fair Work Ombudsman,{' '}
        <a href="https://www.fairwork.gov.au/workplace-problems/record-keeping-and-pay-slips">
          Record-keeping and pay slips
        </a>
        ; Fair Work Act 2009 (Cth) s 557C.
      </Sources>
    </ArticleLayout>
  );
}
