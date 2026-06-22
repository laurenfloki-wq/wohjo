// Golden evals — bot 1 (SEO & content optimisation). Deterministic audit.

import { describe, it, expect } from 'vitest';
import { auditPage, auditSite, type PageSnapshot } from './handler';

const page = (over: Partial<PageSnapshot> & { url: string }): PageSnapshot => ({
  title: 'A good title',
  metaDescription: 'A reasonable meta description.',
  h1Count: 1,
  wordCount: 500,
  ...over,
});

describe('bot 1 — SEO optimisation', () => {
  it('passes a healthy page with no issues', () => {
    expect(auditPage(page({ url: '/ok' }))).toEqual([]);
  });

  it('flags missing title and h1 as high severity', () => {
    const issues = auditPage(page({ url: '/bad', title: null, h1Count: 0 }));
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('missing_title');
    expect(codes).toContain('missing_h1');
    expect(issues.every((i) => (i.code.startsWith('missing') ? i.severity === 'high' : true))).toBe(
      true,
    );
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
