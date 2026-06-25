// The guide registry: the single list every guide is added to. The
// /guides hub renders from it and sitemap.ts enumerates it, so shipping a
// new guide means adding one entry here plus its route — nothing else to
// remember.

export interface GuideMeta {
  /** Site-relative path / canonical, e.g. '/payday-super-labour-hire'. */
  path: string;
  /** Card title on the /guides hub (front-loaded primary keyword). */
  title: string;
  /** One-line description on the hub and the cluster's internal links. */
  blurb: string;
  /** ISO date (YYYY-MM-DD). */
  published: string;
  /** ISO date (YYYY-MM-DD). */
  modified: string;
  /** Sitemap priority (0-1). Defaults to 0.7. */
  priority?: number;
  /** Sitemap change frequency. Defaults to 'monthly'. */
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
}

export const GUIDES: GuideMeta[] = [
  {
    path: '/payday-super-labour-hire',
    title: 'Payday Super for construction & labour hire',
    blurb:
      'From 1 July 2026 super is paid every pay run, received within 7 business days. What changes for labour hire, and why hours must be verified before payroll.',
    published: '2026-06-24',
    modified: '2026-06-24',
    priority: 0.9,
    changeFrequency: 'monthly',
  },
  {
    path: '/construction-time-tracking-software-australia',
    title: 'Construction time-tracking software in Australia',
    blurb:
      'Compare time-tracking and labour hire timesheet software by capability — and the evidence/tamper-resistance column most tools leave empty.',
    published: '2026-06-24',
    modified: '2026-06-24',
    priority: 0.8,
    changeFrequency: 'monthly',
  },
  {
    path: '/legally-defensible-timesheets-construction',
    title: 'Legally defensible timesheets for Australian construction',
    blurb:
      'What makes a construction time record stand up: Fair Work record-keeping, tamper-evident digital trails, verified-at-source hours, and a defensibility checklist.',
    published: '2026-06-24',
    modified: '2026-06-24',
    priority: 0.8,
    changeFrequency: 'monthly',
  },
  {
    path: '/labour-hire-payroll-disputes',
    title: 'Labour hire payroll and timesheet disputes',
    blurb:
      'How disputes start, who pays when hours cannot be proven, and how a sealed evidentiary record settles them in seconds rather than days.',
    published: '2026-06-24',
    modified: '2026-06-24',
    priority: 0.8,
    changeFrequency: 'monthly',
  },
  {
    path: '/fair-work-worked-hour-records',
    title: 'What Fair Work expects from a worked-hour record',
    blurb:
      'A plain-English reference: which records to keep, what a worked-hour record must contain, the seven-year rule, and what happens when records are missing.',
    published: '2026-06-24',
    modified: '2026-06-24',
    priority: 0.7,
    changeFrequency: 'yearly',
  },
];

/** Guides sorted newest-first for the hub listing. */
export function listGuides(): GuideMeta[] {
  return [...GUIDES].sort((a, b) => b.published.localeCompare(a.published));
}
