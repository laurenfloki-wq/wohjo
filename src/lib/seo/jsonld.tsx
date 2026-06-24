// JSON-LD: a render component plus typed builders for every schema the
// content engine emits. One place to author structured data so it stays
// valid (Google Rich Results Test) and consistent across pages.
//
// Render approach follows the Next.js guidance: a native <script
// type="application/ld+json"> with the `<` character escaped to its
// unicode equivalent to neutralise XSS via JSON.stringify.

import { AUTHOR, ORG, SOFTWARE, abs } from './site';

export type JsonLdObject = Record<string, unknown>;

/**
 * Render one or more JSON-LD documents into a single <script> tag.
 * Pass a single object or an array of objects (an @graph is built for
 * arrays so multiple top-level nodes share one script).
 *
 * No CSP nonce is set: the site CSP is currently Content-Security-Policy-
 * REPORT-ONLY (src/proxy.ts), so non-nonced inline data scripts are not
 * blocked, and React blanks the `nonce` prop client-side (anti-theft),
 * which makes a manual nonce produce a noisy hydration mismatch for zero
 * functional gain. When the CSP is promoted to enforce, ld+json will need
 * a framework-level nonce strategy alongside the existing script handling.
 */
export function JsonLd({ data }: { data: JsonLdObject | JsonLdObject[] }) {
  const payload = Array.isArray(data) ? { '@context': 'https://schema.org', '@graph': data } : data;
  return (
    <script
      type="application/ld+json"
      // Escaping `<` blocks any `</script>` or HTML-tag injection through
      // string values. See Next.js JSON-LD guidance.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(payload).replace(/</g, '\\u003c'),
      }}
    />
  );
}

// ── Site-wide entities ──────────────────────────────────────────────────────

export function organizationSchema(): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORG.id,
    name: ORG.name,
    legalName: ORG.legalName,
    url: ORG.url,
    logo: ORG.logo,
    foundingDate: ORG.foundingDate,
    areaServed: ORG.areaServed,
    email: ORG.email,
    identifier: {
      '@type': 'PropertyValue',
      propertyID: 'ACN',
      value: ORG.acn,
    },
  };
}

export function softwareApplicationSchema(): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': SOFTWARE.id,
    name: SOFTWARE.name,
    applicationCategory: SOFTWARE.applicationCategory,
    operatingSystem: SOFTWARE.operatingSystem,
    url: SOFTWARE.url,
    description: SOFTWARE.description,
    publisher: { '@id': ORG.id },
    // No aggregateRating / offers price — no fabricated trust signals.
  };
}

// ── Author (reused by every Article node) ───────────────────────────────────

export function personSchema(): JsonLdObject {
  return {
    '@type': 'Person',
    name: AUTHOR.name,
    jobTitle: AUTHOR.jobTitle,
    description: AUTHOR.description,
    knowsAbout: [...AUTHOR.knowsAbout],
  };
}

// ── Per-page article ────────────────────────────────────────────────────────

export interface ArticleSchemaInput {
  /** 'Article' or 'TechArticle'. */
  type?: 'Article' | 'TechArticle';
  headline: string;
  description: string;
  /** Site-relative path, e.g. '/payday-super-labour-hire'. */
  path: string;
  datePublished: string;
  dateModified: string;
  /** schema.org Thing names this article is about (entity disambiguation). */
  about?: string[];
  /** CSS selector(s) for the speakable short-answer block. */
  speakableSelector?: string[];
}

export function articleSchema(input: ArticleSchemaInput): JsonLdObject {
  const {
    type = 'Article',
    headline,
    description,
    path,
    datePublished,
    dateModified,
    about,
    speakableSelector,
  } = input;

  const node: JsonLdObject = {
    '@context': 'https://schema.org',
    '@type': type,
    headline,
    description,
    datePublished,
    dateModified,
    inLanguage: 'en-AU',
    author: personSchema(),
    publisher: { '@id': ORG.id },
    mainEntityOfPage: { '@type': 'WebPage', '@id': abs(path) },
  };

  if (speakableSelector?.length) {
    node.speakable = {
      '@type': 'SpeakableSpecification',
      cssSelector: speakableSelector,
    };
  }
  if (about?.length) {
    node.about = about.map((name) => ({ '@type': 'Thing', name }));
  }
  return node;
}

// ── FAQ ─────────────────────────────────────────────────────────────────────

export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * FAQPage schema built from the SAME data the visible FAQ renders, so the
 * structured data and the on-page questions can never drift apart.
 */
export function faqPageSchema(items: FaqItem[]): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.question,
      acceptedAnswer: { '@type': 'Answer', text: it.answer },
    })),
  };
}

// ── Breadcrumbs ─────────────────────────────────────────────────────────────

export interface Crumb {
  name: string;
  /** Site-relative path. */
  path: string;
}

export function breadcrumbSchema(crumbs: Crumb[]): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: abs(c.path),
    })),
  };
}

// ── Defined terms (makes a named standard machine-readable) ─────────────────

export interface DefinedTerm {
  name: string;
  description: string;
}

export interface DefinedTermSetInput {
  name: string;
  description: string;
  /** Site-relative path of the canonical definition page. */
  path: string;
  terms: DefinedTerm[];
}

export function definedTermSetSchema(input: DefinedTermSetInput): JsonLdObject {
  const setId = `${abs(input.path)}#termset`;
  return {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    '@id': setId,
    name: input.name,
    description: input.description,
    url: abs(input.path),
    publisher: { '@id': ORG.id },
    hasDefinedTerm: input.terms.map((t) => ({
      '@type': 'DefinedTerm',
      name: t.name,
      description: t.description,
      inDefinedTermSet: { '@id': setId },
    })),
  };
}
