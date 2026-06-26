import { describe, it, expect } from 'vitest';
import { GET } from './route';
import { renderLlmsTxt } from '@/lib/seo/llms';
import { getIndexableUrls } from '@/lib/seo/routes';

// Match a markdown link line: "- [Title](https://...): description".
const LINK_LINE = /^- \[.+\]\((https:\/\/\S+)\): .+$/;

describe('/llms.txt', () => {
  it('GET returns 200 as text/plain; charset=utf-8', async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await res.text()).toBe(renderLlmsTxt());
  });

  it('is structured: H1, an authority blockquote, and well-formed link lines', () => {
    const body = renderLlmsTxt();
    expect(body.startsWith('# ')).toBe(true);
    expect(body.split('\n').some((l) => l.startsWith('> '))).toBe(true);

    const linkLines = body.split('\n').filter((l) => l.startsWith('- '));
    expect(linkLines.length).toBeGreaterThan(0);
    for (const line of linkLines) expect(line).toMatch(LINK_LINE);
  });

  it('emits EXACTLY the single-source URL set (sitemap/IndexNow parity, no drift)', () => {
    const body = renderLlmsTxt();
    const emitted = [...body.matchAll(new RegExp(LINK_LINE, 'gm'))].map((m) => m[1]).sort();
    // Same source as sitemap.xml + IndexNow — adding a guide to the registry
    // appears here automatically, and any divergence fails CI.
    expect(emitted).toEqual([...getIndexableUrls()].sort());
  });

  it('emits only absolute https URLs', () => {
    for (const url of getIndexableUrls()) expect(url.startsWith('https://')).toBe(true);
  });
});
