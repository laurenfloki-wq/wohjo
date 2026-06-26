// Serves /llms.txt as text/plain. The body is generated from the single
// shared route source (src/lib/seo/routes.ts), the same source behind
// sitemap.xml and the IndexNow ping. Static — it only depends on the
// registry, resolved at build time.

import { renderLlmsTxt } from '@/lib/seo/llms';

export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(renderLlmsTxt(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
