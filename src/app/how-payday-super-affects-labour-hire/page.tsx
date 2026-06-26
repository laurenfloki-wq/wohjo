// /how-payday-super-affects-labour-hire — Payday Super answer page.
// Time-critical: live and indexed before the 1 July 2026 commencement.

import type { Metadata } from 'next';
import { ArticleLayout } from '@/components/content/ArticleLayout';
import { ShortAnswer, AtAGlance, Related, Sources } from '@/components/content/blocks';
import { Faq, type FaqItem } from '@/components/content/Faq';
import { buildArticleMetadata, contentViewport } from '@/lib/seo/metadata';

const PATH = '/how-payday-super-affects-labour-hire';
const PUBLISHED = '2026-06-26';
const MODIFIED = '2026-06-26';

export const viewport = contentViewport;

export const metadata: Metadata = buildArticleMetadata({
  title: 'How Does Payday Super Affect Labour Hire?',
  description:
    'From 1 July 2026 Payday Super makes super payable on every pay run, received within 7 business days. What that changes for labour hire, and why hours must be right first.',
  path: PATH,
  published: PUBLISHED,
  modified: MODIFIED,
});

const FAQ: FaqItem[] = [
  {
    question: 'How does Payday Super affect labour hire businesses?',
    answer:
      'From 1 July 2026, super must be paid on every pay run rather than quarterly, with contributions received by the employee’s fund within 7 business days of payday. Labour hire businesses typically run weekly or fortnightly payroll, so each run becomes a super event with a hard, short deadline — and the super is calculated on the worked hours feeding that run.',
  },
  {
    question: 'When does Payday Super start?',
    answer:
      'Payday Super starts on 1 July 2026 and applies to all employers, with no phase-in. It is legislated under the Treasury Laws Amendment (Payday Superannuation) Act 2025.',
  },
  {
    question: 'Does Payday Super apply to labour hire contractors?',
    answer:
      'It applies to employers with Superannuation Guarantee obligations, which can include independent contractors paid mainly for their labour — a common arrangement in construction labour hire. If you pay super for a worker today, from 1 July 2026 you pay it on payday.',
  },
  {
    question: 'What happens if the worked hours are wrong?',
    answer:
      'Super is calculated on paid earnings, which come from worked hours. If the hours are wrong, the super is wrong, and underpaid super can trigger the Super Guarantee Charge — not tax deductible, with penalties that can reach 200 percent and Director Penalty Notices. Correcting hours after the money has moved is slower and costlier than getting them right beforehand.',
  },
];

export default function Page() {
  return (
    <ArticleLayout
      crumbs={[
        { name: 'Home', path: '/' },
        { name: 'Guides', path: '/guides' },
        { name: 'How Payday Super affects labour hire', path: PATH },
      ]}
      eyebrow="Payday Super · 1 July 2026 · Labour hire"
      title="How does Payday Super affect labour hire?"
      lede="The five-day rule, the weekly exposure, and why the worked hours feeding each pay run matter more than they used to."
      published={PUBLISHED}
      modified={MODIFIED}
      schema={{
        type: 'TechArticle',
        headline: 'How does Payday Super affect labour hire?',
        description:
          'How Payday Super (from 1 July 2026) changes labour hire payroll: super on every pay run, the 7 business day rule, and why verified worked hours matter before payroll.',
        path: PATH,
        datePublished: PUBLISHED,
        dateModified: MODIFIED,
        about: ['Payday Super', 'Labour hire', 'Superannuation Guarantee', 'Payroll'],
        speakableSelector: ['h1', '.answer'],
      }}
      hero={
        <>
          <ShortAnswer>
            From <strong>1 July 2026</strong>, Payday Super requires super to be paid on every pay
            run, with contributions received by the employee’s fund{' '}
            <strong>within 7 business days of payday</strong> — not quarterly. For labour hire,
            which runs weekly or fortnightly, that turns every run into a super event, so the worked
            hours feeding each run must be right <strong>before</strong> payroll, not reconciled
            afterward.
          </ShortAnswer>
          <AtAGlance
            items={[
              <>
                <strong>Starts:</strong> 1 July 2026, every employer, no phase-in.
              </>,
              <>
                <strong>Rule:</strong> super received by the fund within 7 business days of payday.
              </>,
              <>
                <strong>Labour hire effect:</strong> weekly runs mean weekly super exposure.
              </>,
              <>
                <strong>The pressure point:</strong> the hours feeding each run.
              </>,
            ]}
          />
        </>
      }
    >
      <h2>What changes on 1 July 2026?</h2>
      <p>
        Payday Super is the most significant change to the Superannuation Guarantee since it began
        in 1992. Super stops being a quarterly payment and becomes part of every pay run: the
        contribution must be received by the employee’s fund within 7 business days of payday. The
        clock measures to receipt, not to when you send it, and clearing houses can take one to
        three business days to transmit — so the practical window is tighter than it looks.
      </p>

      <h2>Why this lands harder on labour hire</h2>
      <p>
        Most labour hire businesses run weekly or fortnightly payroll. Under the old quarterly
        system, a wrong timesheet, a disputed shift, or a supervisor sign-off that never landed
        could be fixed before the next quarterly deadline. That slack is gone. Every run is now a
        super event with a hard, short clock, and weekly runs mean weekly exposure.
      </p>

      <h2>The hours are where the risk is</h2>
      <p className="pull">
        Payday Super calculates on the hours you report — every week, now. It says nothing about
        whether your <a href="/fair-work-worked-hour-records">record of those hours</a> will hold up
        if a pay run is ever challenged.
      </p>
      <p>
        That is the gap the <a href="/wles">Workforce Ledger Evidentiary Standard (WLES)</a>{' '}
        addresses: hours verified at the point of work, approved by the supervisor, and sealed into
        a tamper-evident record before payroll. Flostruction does not calculate wages, award
        entitlements, tax, or superannuation — it makes the hours those systems start from
        verifiable.
      </p>

      <Faq items={FAQ} heading="Payday Super and labour hire: FAQ" />

      <Related
        links={[
          {
            href: '/payday-super-labour-hire',
            label: 'Payday Super for construction & labour hire',
          },
          {
            href: '/payday-super-record-keeping',
            label: 'Payday Super record-keeping requirements',
          },
          {
            href: '/payday-super-compliance-labour-hire',
            label: 'How labour hire firms comply with Payday Super',
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
        <a href="https://www.fairwork.gov.au/newsroom/news/payday-super-new-rules-starting-1-july-2026">
          Payday Super: new rules starting 1 July 2026
        </a>
        .
      </Sources>
    </ArticleLayout>
  );
}
