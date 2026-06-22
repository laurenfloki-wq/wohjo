// Bot 1 — SEO & content optimisation.
//
// Trigger: weekly | Runtime: pg_cron->EF | Gate: T1 report, T2 publish |
// Model: Haiku/Sonnet (fixes + briefs). The crawl audit is deterministic; the
// LLM only proposes fixes and briefs. Publishing changes is gated T2.

export const BOT_ID = 'bot-1-seo-optimisation';

export interface PageSnapshot {
  url: string;
  title: string | null;
  metaDescription: string | null;
  h1Count: number;
  wordCount: number;
}

export type SeoIssueCode =
  | 'missing_title'
  | 'title_too_long'
  | 'missing_meta_description'
  | 'meta_description_too_long'
  | 'missing_h1'
  | 'multiple_h1'
  | 'thin_content';

export interface SeoIssue {
  url: string;
  code: SeoIssueCode;
  severity: 'high' | 'medium' | 'low';
}

// Google typically truncates titles ~60 chars and meta descriptions ~160.
const TITLE_MAX = 60;
const META_MAX = 160;
const THIN_CONTENT_WORDS = 300;

/** Pure: deterministic SEO audit of a single page. */
export function auditPage(p: PageSnapshot): SeoIssue[] {
  const issues: SeoIssue[] = [];
  const add = (code: SeoIssueCode, severity: SeoIssue['severity']) =>
    issues.push({ url: p.url, code, severity });

  if (!p.title) add('missing_title', 'high');
  else if (p.title.length > TITLE_MAX) add('title_too_long', 'low');

  if (!p.metaDescription) add('missing_meta_description', 'medium');
  else if (p.metaDescription.length > META_MAX) add('meta_description_too_long', 'low');

  if (p.h1Count === 0) add('missing_h1', 'high');
  else if (p.h1Count > 1) add('multiple_h1', 'low');

  if (p.wordCount < THIN_CONTENT_WORDS) add('thin_content', 'medium');

  return issues;
}

const SEVERITY_RANK: Record<SeoIssue['severity'], number> = { high: 0, medium: 1, low: 2 };

/** Pure: audit a site and return a prioritised fix list (highest severity first). */
export function auditSite(pages: ReadonlyArray<PageSnapshot>): SeoIssue[] {
  return pages
    .flatMap(auditPage)
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
