// ArticleLayout — the shared shell every guide inherits. It paints the
// construction-noir content surface, the brand chrome (header + footer),
// the breadcrumb, the hero (eyebrow / H1 / lede / byline), and emits the
// Article (or TechArticle) JSON-LD. The page supplies its own body, hero
// extras (short answer + at-a-glance), and schema input.
//
// Server Component: no client interactivity, so metadata resolves on the
// server and the whole page is statically prerenderable.

import type { ReactNode } from 'react';
import Link from 'next/link';
import './content.css';
import { JsonLd, articleSchema, type ArticleSchemaInput, type Crumb } from '@/lib/seo/jsonld';
import { ORG } from '@/lib/seo/site';
import { Breadcrumbs } from './Breadcrumbs';
import { AuthorByline } from './AuthorByline';

/**
 * Standard compliance disclaimer carried by every content page. Wording is
 * fixed so the legal footer is identical across the cluster.
 */
export const DEFAULT_DISCLAIMER: ReactNode = (
  <>
    This page provides general information only and does not constitute legal, financial, or tax
    advice. Obligations described here are administered by the relevant Australian authorities;
    confirm current requirements at the source or with a qualified adviser. Flostruction is a
    workforce time verification platform and does not calculate wages, award entitlements, tax, or
    superannuation. © 2026 {ORG.name} (ACN {ORG.acn}). Flostruction is a product of {ORG.name}.
    Built in Australia.
  </>
);

export function ContentHeader() {
  return (
    <header className="top">
      <div className="wrap">
        <div className="brand">
          FLOSTRUCTION <span>· Time Verification</span>
        </div>
        <nav className="topnav" aria-label="Primary">
          <Link href="/">Home</Link>
          <Link href="/wles">The standard</Link>
          <Link href="/guides">Guides</Link>
        </nav>
      </div>
    </header>
  );
}

export interface ArticleLayoutProps {
  crumbs: Crumb[];
  eyebrow?: string;
  /** Visible H1. */
  title: string;
  lede?: ReactNode;
  published: string;
  modified: string;
  /** JSON-LD input — headline/description here may differ from the H1. */
  schema: ArticleSchemaInput;
  /** Hero extras rendered after the byline (short answer, at-a-glance). */
  hero?: ReactNode;
  /** Article body. */
  children: ReactNode;
  /** Footer disclaimer; defaults to the standard compliance wording. */
  disclaimer?: ReactNode;
}

export function ArticleLayout({
  crumbs,
  eyebrow,
  title,
  lede,
  published,
  modified,
  schema,
  hero,
  children,
  disclaimer = DEFAULT_DISCLAIMER,
}: ArticleLayoutProps) {
  return (
    <div className="flos-article">
      <JsonLd data={articleSchema(schema)} />
      <ContentHeader />

      <main id="main" tabIndex={-1}>
        <div className="wrap">
          <Breadcrumbs crumbs={crumbs} />
        </div>

        <div className="hero">
          <div className="wrap">
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h1>{title}</h1>
            {lede && <p className="lede">{lede}</p>}
            <AuthorByline published={published} modified={modified} />
            {hero}
          </div>
        </div>

        <article>
          <div className="wrap">{children}</div>
        </article>
      </main>

      <footer>
        <div className="wrap">
          <p className="disclaimer">{disclaimer}</p>
        </div>
      </footer>
    </div>
  );
}

export default ArticleLayout;
