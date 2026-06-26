// /labour-hire-licence/[state] — per-jurisdiction answer page.
//
// One dynamic route renders every state/territory from the verified data in
// src/lib/seo/labour-hire-licence.ts. Each page leads with an extractable
// "Do you need a licence in [State]?" answer (speakable), is schema-marked
// (TechArticle + FAQPage + BreadcrumbList via ArticleLayout/Faq), and cites
// the official regulator. The only call to action is the records bridge —
// no demo/pricing CTA.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArticleLayout } from '@/components/content/ArticleLayout';
import { ShortAnswer, Related, Sources } from '@/components/content/blocks';
import { Faq } from '@/components/content/Faq';
import { buildArticleMetadata, contentViewport } from '@/lib/seo/metadata';
import {
  LICENCE_STATES,
  LICENCE_PUBLISHED,
  LICENCE_MODIFIED,
  LICENCE_HUB_PATH,
  getStateBySlug,
  licenceStatePath,
} from '@/lib/seo/labour-hire-licence';

export const viewport = contentViewport;
export const dynamicParams = false;

export function generateStaticParams() {
  return LICENCE_STATES.map((s) => ({ state: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ state: string }>;
}): Promise<Metadata> {
  const { state } = await params;
  const data = getStateBySlug(state);
  if (!data) return {};
  return buildArticleMetadata({
    title: data.metaTitle,
    description: data.metaDescription,
    path: licenceStatePath(data.slug),
    published: LICENCE_PUBLISHED,
    modified: LICENCE_MODIFIED,
  });
}

export default async function StateLicencePage({ params }: { params: Promise<{ state: string }> }) {
  const { state } = await params;
  const data = getStateBySlug(state);
  if (!data) notFound();

  const related = data.related
    .map((slug) => getStateBySlug(slug))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  return (
    <ArticleLayout
      crumbs={[
        { name: 'Home', path: '/' },
        { name: 'Labour hire licensing', path: LICENCE_HUB_PATH },
        { name: data.state, path: licenceStatePath(data.slug) },
      ]}
      eyebrow={`Labour hire licensing · ${data.state}`}
      title={`Do you need a labour hire licence in ${data.state}?`}
      lede={
        data.hasScheme
          ? `${data.state} runs a mandatory labour hire licensing scheme. Here is who must hold a licence, who regulates it, and what it means for an interstate operator.`
          : `${data.state} has no dedicated labour hire licensing scheme — but the cross-border obligations still bite. Here is what applies, and what to do if you supply workers interstate.`
      }
      published={LICENCE_PUBLISHED}
      modified={LICENCE_MODIFIED}
      schema={{
        type: 'TechArticle',
        headline: `Do you need a labour hire licence in ${data.state}?`,
        description: data.metaDescription,
        path: licenceStatePath(data.slug),
        datePublished: LICENCE_PUBLISHED,
        dateModified: LICENCE_MODIFIED,
        about: [
          'Labour hire licensing',
          `${data.state} labour hire licence`,
          ...(data.act ? [data.act] : []),
        ],
        // Speakable: the H1 and the extractable answer lead.
        speakableSelector: ['h1', '.answer'],
      }}
      hero={<ShortAnswer label="Do you need a licence?">{data.answer}</ShortAnswer>}
    >
      <h2>Who must hold a licence, and who regulates it?</h2>
      {data.whoRegulates.map((para, i) => (
        <p key={i}>{para}</p>
      ))}

      <h2>Supplying workers into {data.state} from interstate</h2>
      <p>{data.crossBorder}</p>

      {data.penaltiesRegister && (
        <>
          <h2>Penalties and the public register</h2>
          <p>{data.penaltiesRegister}</p>
        </>
      )}

      {/* Records bridge — the only call to action (read further). */}
      <h2>The records gap a licence does not close</h2>
      <p className="pull">
        A labour hire licence confirms you’re permitted to supply workers. It says nothing about
        whether your <a href="/fair-work-worked-hour-records">record of the hours</a> those workers
        actually worked will hold up if it’s ever challenged.
      </p>
      <p>
        That is the gap the <a href="/wles">Workforce Ledger Evidentiary Standard (WLES)</a>{' '}
        addresses: hours verified at the point of work, approved by the supervisor, and sealed into
        a tamper-evident record before payroll.
      </p>

      <Faq items={data.faq} heading={`Labour hire licensing in ${data.state}: FAQ`} />

      <Related
        links={[
          { href: LICENCE_HUB_PATH, label: 'Labour hire licensing across Australia' },
          ...related.map((s) => ({
            href: licenceStatePath(s.slug),
            label: `Labour hire licence in ${s.state}`,
          })),
          {
            href: '/payday-super-labour-hire',
            label: 'Payday Super for construction & labour hire',
          },
          { href: '/wles', label: 'The Workforce Ledger Evidentiary Standard (WLES)' },
        ]}
      />

      <Sources>
        {data.sources.map((s, i) => (
          <span key={s.url}>
            {i > 0 ? '; ' : ''}
            <a href={s.url}>{s.label}</a>
          </span>
        ))}
        .
      </Sources>
    </ArticleLayout>
  );
}
