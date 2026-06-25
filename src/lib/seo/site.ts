// Single source of truth for site-wide SEO/GEO constants.
//
// Everything the content engine needs to describe FLOSMOSIS, the
// Flostruction product, and the credentialed author lives here so the
// JSON-LD builders, metadata helpers, and content components stay in
// sync. Change a fact once, every page inherits it.
//
// Australian English throughout. No fabricated trust signals — no
// ratings, no review counts, no invented customers.

export const SITE_URL = 'https://flosmosis.com';

/** Default Open Graph / Twitter share image (1200x630). Lives in public/. */
export const OG_IMAGE_PATH = '/marketing/og.png';
export const OG_IMAGE_URL = `${SITE_URL}${OG_IMAGE_PATH}`;

/** Build an absolute URL from a site-relative path. */
export function abs(path: string): string {
  if (path.startsWith('http')) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

// ── Organisation (publisher / legal entity) ────────────────────────────────

export const ORG = {
  name: 'FLOSMOSIS PTY LTD',
  legalName: 'FLOSMOSIS PTY LTD',
  acn: '697 323 925',
  url: SITE_URL,
  logo: OG_IMAGE_URL,
  foundingDate: '2026',
  areaServed: 'AU',
  /** Stable @id so other schema nodes can reference the same entity. */
  id: `${SITE_URL}/#organization`,
  email: 'standards@flosmosis.com',
  /**
   * Subject areas the organisation demonstrably covers — these all map to
   * the published content cluster, so this is grounding, not a claim of
   * expertise we cannot show.
   */
  knowsAbout: [
    'Australian workplace compliance',
    'Superannuation Guarantee',
    'Payday Super',
    'Labour hire',
    'Labour hire licensing',
    'Payroll record-keeping',
    'Fair Work record-keeping',
    'Construction workforce time tracking',
    'Workforce Ledger Evidentiary Standard',
  ],
  /**
   * Verified external identity URLs only (schema.org sameAs) — the property
   * search and AI systems use to consolidate this entity across the web.
   * Add ONLY confirmed canonical URLs; never guess or fabricate. It is
   * emitted into the JSON-LD only when non-empty (see organizationSchema),
   * so an empty list ships nothing.
   *
   * CONFIRMED (awaiting Lauren — paste exact canonical URLs, then they ship
   * with the next deploy):
   *   - LinkedIn company page
   *   - Instagram (confirm exact; candidate https://www.instagram.com/flostruction/)
   * PENDING (add when each is live):
   *   - Wikidata QID URL
   *   - Crunchbase org URL
   *   - WLES preprint DOI URL
   *   - ASIC/ABN public record URL
   */
  sameAs: [] as readonly string[],
} as const;

// ── Product (the application being described) ───────────────────────────────

export const SOFTWARE = {
  name: 'Flostruction',
  id: `${SITE_URL}/#flostruction`,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web, iOS, Android',
  url: SITE_URL,
  description:
    'Time verification for Australian construction and labour hire. Hours are confirmed on site, approved by the supervisor via SMS, and sealed into a permanent, tamper-evident record under the Workforce Ledger Evidentiary Standard (WLES) before they reach payroll.',
} as const;

// ── Author (E-E-A-T signal — the real person) ──────────────────────────────

export const AUTHOR = {
  name: 'Lauren Kate de Mestre',
  jobTitle: 'Director, FLOSMOSIS PTY LTD',
  description: 'Admitted solicitor of the Supreme Court of NSW and former PwC senior consultant.',
  knowsAbout: [
    'Australian workplace compliance',
    'Superannuation Guarantee',
    'Labour hire',
    'Payroll record-keeping',
  ],
  /** Human-readable credential line for the visible byline. */
  credential: 'Admitted solicitor (Supreme Court of NSW) · former PwC · Director, FLOSMOSIS',
} as const;
