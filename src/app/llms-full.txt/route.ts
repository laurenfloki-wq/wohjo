// Serves /llms-full.txt as text/plain — the expanded llms variant: the
// curated index plus the full extractable answer for every labour hire
// licensing jurisdiction. Generated from the same data as /llms.txt and
// sitemap.xml, so it cannot drift. Static — depends only on the registry.

import { renderLlmsFullTxt } from '@/lib/seo/llms';

export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(renderLlmsFullTxt(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
