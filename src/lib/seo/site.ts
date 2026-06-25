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
