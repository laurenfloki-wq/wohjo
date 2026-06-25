// /wles — Workforce Ledger Evidentiary Standard landing
//
// Renders the canonical WLES landing content from
// src/content/wles/wles-landing.html, wrapped in the WlesLayout shell
// with the formation-phase banner.
//
// Source: ~/OneDrive/FLOSMOSIS/wles-io/index.html (transformed: cross-WLES-
// site links rewritten to /wles/* paths on flosmosis.com).

import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import WlesLayout from '@/components/wles/WlesLayout';
import { JsonLd } from '@/lib/seo/jsonld';
import { WLES_SCHEMA, WLES_PREPRINT } from './wles-schema';

export const metadata: Metadata = {
  title: 'WLES — Workforce Ledger Evidentiary Standard',
  description:
    'The Workforce Ledger Evidentiary Standard is an open, royalty-free technical standard for cryptographic verification of labour events in contingent workforce arrangements. Published by the WLES Foundation.',
  alternates: {
    canonical: 'https://flosmosis.com/wles',
  },
};

const html = fs.readFileSync(
  path.join(process.cwd(), 'src/content/wles/wles-landing.html'),
  'utf-8',
);

export default function WlesLandingPage() {
  return (
    <WlesLayout title="WLES — Workforce Ledger Evidentiary Standard" active="wles">
      {/* Machine-readable standard: TechArticle + DefinedTermSet. */}
      {WLES_SCHEMA.map((block, i) => (
        <JsonLd key={i} data={block} />
      ))}
      <div dangerouslySetInnerHTML={{ __html: html }} />

      {/* How to cite — the academic preprint that corroborates the standard. */}
      <section aria-labelledby="how-to-cite" style={{ marginTop: 40 }}>
        <h2 id="how-to-cite">How to cite</h2>
        <p>
          {WLES_PREPRINT.authorCitation} ({WLES_PREPRINT.datePublished.slice(0, 4)}).{' '}
          {WLES_PREPRINT.title}. <a href={WLES_PREPRINT.url}>{WLES_PREPRINT.url}</a>
        </p>
      </section>
    </WlesLayout>
  );
}
