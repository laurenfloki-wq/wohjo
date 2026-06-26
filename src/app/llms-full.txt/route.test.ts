import { describe, it, expect } from 'vitest';
import { GET } from './route';
import { renderLlmsTxt, renderLlmsFullTxt } from '@/lib/seo/llms';
import { getIndexableUrls } from '@/lib/seo/routes';
import { LICENCE_STATES } from '@/lib/seo/labour-hire-licence';

describe('/llms-full.txt', () => {
  it('GET returns 200 as text/plain; charset=utf-8', async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await res.text()).toBe(renderLlmsFullTxt());
  });

  it('contains the full index (every indexable URL) plus the licensing appendix', () => {
    const full = renderLlmsFullTxt();
    for (const url of getIndexableUrls()) expect(full).toContain(url);
    expect(full).toContain('## Labour hire licensing — answers by jurisdiction');
  });

  it('inlines every jurisdiction’s extractable answer (the expansion)', () => {
    const full = renderLlmsFullTxt();
    for (const s of LICENCE_STATES) {
      expect(full).toContain(`Do you need a labour hire licence in ${s.state}?`);
      expect(full).toContain(s.answer);
    }
  });

  it('is a strict superset of llms.txt (longer, same header)', () => {
    const short = renderLlmsTxt();
    const full = renderLlmsFullTxt();
    expect(full.length).toBeGreaterThan(short.length);
    expect(full.startsWith('# FLOSMOSIS — Flostruction')).toBe(true);
  });
});
