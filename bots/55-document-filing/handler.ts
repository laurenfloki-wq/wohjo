// Bot 55 — Document filing.
//
// Trigger: Drive webhook | Runtime: EF | Gate: T0 | Model: Haiku (classify +
// name). Consistent naming/versioning + retention; reversible. The naming,
// versioning, and retention rules are deterministic; Haiku only classifies the
// document type for borderline cases.

export const BOT_ID = 'bot-55-document-filing';

export type DocType = 'contract' | 'invoice' | 'bas' | 'resolution' | 'misc';

// Australian retention defaults (years). Tax/financial records: 5 years.
const RETENTION_YEARS: Record<DocType, number> = {
  contract: 7,
  invoice: 5,
  bas: 5,
  resolution: 7,
  misc: 2,
};

export function retentionYears(type: DocType): number {
  return RETENTION_YEARS[type];
}

/** Pure: a slug-safe token from arbitrary text. */
function slug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Pure: deterministic file name TYPE_subject_YYYY-MM-DD_vN. Same inputs always
 * produce the same name (idempotent filing; no accidental duplicates).
 */
export function buildFileName(opts: {
  type: DocType;
  subject: string;
  isoDate: string;
  version: number;
}): string {
  return `${opts.type}_${slug(opts.subject)}_${opts.isoDate}_v${opts.version}`;
}

/** Pure: next version given the highest existing version (0 if none). */
export function nextVersion(existingVersions: ReadonlyArray<number>): number {
  return existingVersions.length === 0 ? 1 : Math.max(...existingVersions) + 1;
}
