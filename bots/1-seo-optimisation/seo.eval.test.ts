// Golden evals — bot 1 (SEO & content optimisation), FLOSMOSIS-calibrated.

import { describe, it, expect } from 'vitest';
import { auditPage, auditSite, type PageSnapshot } from './handler';

// Healthy baseline targets an evidentiary keyword (so it does not flag).
const page = (over: Partial<PageSnapshot> & { url: string }): PageSnapshot => ({
  title: 'Labour hire compliance, sealed time records',
  metaDescription: 'Tamper-evident payroll evidence for labour hire.',
  h1Count: 1,
  wordCount: 500,
  ...over,
});

describe('bot 1 — SEO optimisation (calibrated)', () => {
  it('passes a healthy, on-topic page with no issues', () => {
    expect(auditPage(page({ url: '/ok' }))).toEqual([]);
  });

  it('flags missing title and h1 as high severity', () => {
    const issues = auditPage(page({ url: '/bad', title: null, h1Count: 0 }));
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('missing_title');
    expect(codes).toContain('missing_h1');
  });

  it('flags a page that targets none of the evidentiary keywords', () => {
    const issues = auditPage(
      page({ url: '/generic', title: 'About our company', metaDescription: 'We do things well.' }),
    );
    expect(issues.map((i) => i.code)).toContain('no_target_keyword');
  });

  it('flags thin content and long meta', () => {
    const issues = auditPage(
      page({ url: '/thin', wordCount: 100, metaDescription: 'x'.repeat(200) }),
    );
    expect(issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(['thin_content', 'meta_description_too_long']),
    );
  });

  it('prioritises high-severity issues first across a site', () => {
    const issues = auditSite([
      page({ url: '/a', wordCount: 100 }),
      page({ url: '/b', title: null }),
    ]);
    expect(issues[0]?.severity).toBe('high');
  });
});
