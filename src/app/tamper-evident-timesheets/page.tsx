// /tamper-evident-timesheets — answer page on what makes a timesheet
// tamper-evident, and why an editable spreadsheet is not.

import type { Metadata } from 'next';
import { ArticleLayout } from '@/components/content/ArticleLayout';
import {
  ShortAnswer,
  AtAGlance,
  ComparisonTable,
  Checklist,
  Related,
  Sources,
} from '@/components/content/blocks';
import { Faq, type FaqItem } from '@/components/content/Faq';
import { buildArticleMetadata, contentViewport } from '@/lib/seo/metadata';

const PATH = '/tamper-evident-timesheets';
const PUBLISHED = '2026-06-27';
const MODIFIED = '2026-06-27';

export const viewport = contentViewport;

export const metadata: Metadata = buildArticleMetadata({
  title: 'What Makes a Timesheet Tamper-Evident?',
  description:
    'A tamper-evident timesheet is one where any change to a sealed record is detectable: hours captured at the source, independently approved, and cryptographically sealed so alteration cannot pass unnoticed.',
  path: PATH,
  published: PUBLISHED,
  modified: MODIFIED,
});

const FAQ: FaqItem[] = [
  {
    question: 'What makes a timesheet tamper-evident?',
    answer:
      'A timesheet is tamper-evident when any change to a finalised record can be detected after the fact. In practice that means the hours are captured when the work happens, approved by someone independent of the worker, and then sealed — typically with a cryptographic hash and an append-only log — so a later edit either fails or leaves a visible trace rather than silently overwriting the original.',
  },
  {
    question: 'Is a spreadsheet or a PDF tamper-evident?',
    answer:
      'No. A spreadsheet can be edited by anyone with access and leaves no reliable trace of what changed or when. A PDF looks fixed but can be regenerated from altered source data. Neither proves that the hours shown are the hours that were originally recorded, so neither is tamper-evident in any meaningful sense.',
  },
  {
    question: 'Tamper-evident or tamper-proof — what is the difference?',
    answer:
      'Tamper-proof claims a record cannot be altered at all, which is rarely true of any real system. Tamper-evident is the honest and useful standard: alteration may be possible, but it cannot happen without being detectable. For worked-hour records, tamper-evidence is what gives a record evidentiary weight.',
  },
  {
    question: 'Why do tamper-evident timesheets matter for labour hire?',
    answer:
      'Because the cost of an unprovable hour falls on the labour hire employer, and because corrections are normal — a shift gets adjusted, a break is added. A tamper-evident record preserves both the original entry and any later correction, so the record can be trusted even though it can be amended through a proper, logged process.',
  },
];

export default function Page() {
  return (
    <ArticleLayout
      crumbs={[
        { name: 'Home', path: '/' },
        { name: 'Guides', path: '/guides' },
        { name: 'Tamper-evident timesheets', path: PATH },
      ]}
      eyebrow="Evidence · Timesheets · Tamper-evidence"
      title="What makes a timesheet tamper-evident?"
      lede="A timesheet is only as good as your ability to prove it was not changed after the fact. Here is what tamper-evidence actually means, and why the tools most teams use do not have it."
      published={PUBLISHED}
      modified={MODIFIED}
      schema={{
        type: 'TechArticle',
        headline: 'What makes a timesheet tamper-evident?',
        description:
          'What tamper-evidence means for worked-hour records: capture at the source, independent approval, and a cryptographically sealed, append-only record where any change is detectable.',
        path: PATH,
        datePublished: PUBLISHED,
        dateModified: MODIFIED,
        about: [
          'Tamper-evident records',
          'Timesheets',
          'Worked hours',
          'Cryptographic sealing',
          'Evidence',
        ],
        speakableSelector: ['h1', '.answer'],
      }}
      hero={
        <>
          <ShortAnswer>
            A timesheet is <strong>tamper-evident</strong> when any change to a finalised record can
            be <strong>detected</strong> afterward. Three things make it so: hours{' '}
            <strong>captured at the source</strong> when the work happens, an{' '}
            <strong>independent approval</strong> by someone other than the worker, and a{' '}
            <strong>cryptographic seal</strong> over an append-only record so a later edit fails or
            leaves a visible trace. An editable spreadsheet or a regenerated PDF has none of these,
            so it proves nothing about whether the hours shown are the hours first recorded.
          </ShortAnswer>
          <AtAGlance
            items={[
              <>
                <strong>Captured at source:</strong> recorded when worked, not reconstructed.
              </>,
              <>
                <strong>Independently approved:</strong> confirmed by the supervisor, not
                self-reported.
              </>,
              <>
                <strong>Sealed:</strong> hashed and append-only, so edits are detectable.
              </>,
              <>
                <strong>Tamper-evident, not tamper-proof:</strong> change is possible but never
                silent.
              </>,
            ]}
          />
        </>
      }
    >
      <h2>Tamper-evident, not tamper-proof</h2>
      <p>
        It is worth being precise, because the words get used loosely. Tamper-<em>proof</em> claims
        a record can never be altered. Almost nothing real meets that bar, and claiming it invites
        challenge. Tamper-<em>evident</em> is the standard that matters: a record may be alterable,
        but no alteration can happen without being detectable. That is exactly the property a
        worked-hour record needs to carry weight in a dispute — not a promise that nothing ever
        changes, but proof that nothing changed without being seen.
      </p>

      <h2>The three properties that create tamper-evidence</h2>
      <p>
        Tamper-evidence is not a single feature you switch on. It is the combination of how a record
        is made and how it is sealed.
      </p>
      <Checklist
        items={[
          'Captured at the source: the hours are recorded at the point and time of work, not typed up later from memory or a paper note.',
          'Independently approved: the shift is confirmed by someone other than the worker — typically the site supervisor — so the record is not self-attested.',
          'Cryptographically sealed: the finalised record is hashed and written to an append-only log, so any later change produces a different hash and is detectable.',
          'Correction without erasure: amendments are made as new, logged entries that preserve the original, rather than overwriting it.',
        ]}
      />

      <h2>Why a spreadsheet fails the test</h2>
      <p>
        The most common worked-hour record in labour hire is a spreadsheet, sometimes exported to a
        PDF that looks official. Neither is tamper-evident. A spreadsheet can be changed by anyone
        with access, and the change leaves no reliable trace of what the figure was before or who
        altered it. A PDF freezes an appearance, but it is generated from underlying data that can
        itself be edited and re-exported. Looking fixed is not the same as being provably unchanged.
      </p>

      <ComparisonTable
        caption="Editable record versus tamper-evident record"
        columns={['', 'Spreadsheet or PDF', 'Tamper-evident record']}
        sealColumn={2}
        rows={[
          {
            label: 'Who can change it',
            cells: ['Anyone with access', 'Only through a logged correction'],
          },
          {
            label: 'Is a change detectable',
            cells: ['No reliable trace', 'Yes — the seal no longer matches'],
          },
          {
            label: 'Original after a correction',
            cells: ['Overwritten and lost', 'Preserved alongside the amendment'],
          },
          {
            label: 'Who confirmed the hours',
            cells: ['Usually unrecorded', 'The approving supervisor, recorded'],
          },
          {
            label: 'Weight if challenged',
            cells: ['Easily disputed', 'Settled on the record'],
          },
        ]}
      />

      <h2>How Flostruction makes hours tamper-evident</h2>
      <p className="pull">
        Tamper-evidence is the whole point of an evidentiary record. A record you can quietly change
        is not evidence of anything.
      </p>
      <p>
        Flostruction captures each shift on site, has the supervisor approve it, and seals the
        approved record under <a href="/wles">the Workforce Ledger Evidentiary Standard (WLES)</a> —
        an open standard for verifiable, portable, tamper-evident worked-hour records. The original
        hours and any later correction are both preserved, and the seal makes any change detectable.
        The result is a{' '}
        <a href="/legally-defensible-timesheets-construction">defensible timesheet</a> that holds up
        because it can be shown to be unchanged, not merely asserted to be.
      </p>

      <Faq items={FAQ} heading="Tamper-evident timesheets: FAQ" />

      <Related
        links={[
          {
            href: '/legally-defensible-timesheets-construction',
            label: 'Legally defensible timesheets for Australian construction',
          },
          {
            href: '/who-pays-unproven-labour-hire-hours',
            label: 'Who pays when labour hire hours can’t be proven?',
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
        ; the <a href="/wles/spec">Workforce Ledger Evidentiary Standard specification</a>.
      </Sources>
    </ArticleLayout>
  );
}
