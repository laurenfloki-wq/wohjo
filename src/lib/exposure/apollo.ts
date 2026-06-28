// Apollo company enrichment for captured leads (§5, optional/async).
//
// Best-effort and NON-BLOCKING: it runs after the user's response, with a
// short timeout, and any failure (no key, timeout, rate limit, bad data)
// returns null. It must never block or delay the user's experience, and never
// affects whether the lead is captured. Server-to-server only.

const APOLLO_ENRICH_URL = 'https://api.apollo.io/api/v1/organizations/enrich';
const TIMEOUT_MS = 3500;

export interface EnrichedCompany {
  industry?: string;
  employees?: number;
  website?: string;
  name?: string;
}

/** Public email domains we don't bother enriching (no firmographics there). */
const PUBLIC_DOMAINS = new Set([
  'gmail.com',
  'outlook.com',
  'hotmail.com',
  'yahoo.com',
  'yahoo.com.au',
  'bigpond.com',
  'icloud.com',
  'live.com',
  'me.com',
]);

export function domainFromEmail(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain || PUBLIC_DOMAINS.has(domain)) return null;
  return domain;
}

/**
 * Enrich a company by work-email domain. Returns null on any problem — the
 * caller treats enrichment as a bonus, never a dependency.
 */
export async function enrichCompany(workEmail: string): Promise<EnrichedCompany | null> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return null;
  const domain = domainFromEmail(workEmail);
  if (!domain) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${APOLLO_ENRICH_URL}?domain=${encodeURIComponent(domain)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      organization?: {
        name?: string;
        industry?: string;
        estimated_num_employees?: number;
        website_url?: string;
      };
    };
    const org = data.organization;
    if (!org) return null;
    const out: EnrichedCompany = {};
    if (org.name) out.name = org.name;
    if (org.industry) out.industry = org.industry;
    if (typeof org.estimated_num_employees === 'number') out.employees = org.estimated_num_employees;
    if (org.website_url) out.website = org.website_url;
    return out;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
