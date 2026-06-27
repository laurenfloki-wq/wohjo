// Serves the Labour Hire Licensing Index as raw JSON — the machine-readable
// distribution referenced by the Dataset JSON-LD (CC BY 4.0). Same committed
// data the page renders from. Static.

import { licensingIndexJson } from '@/lib/seo/licensing-index';

export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(licensingIndexJson(), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
