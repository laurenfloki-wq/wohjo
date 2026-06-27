// Australian Labour Hire Licensing Index — merges the committed dataset
// (src/data/licensing-index.json: register URLs + captured metrics) with
// the verified structural facts (src/lib/seo/labour-hire-licence.ts:
// scheme, Act, regulator). One source for the page and its Dataset JSON-LD.
//
// Counts are null until captured from each register (interactive search
// tools — see scripts/licensing-index-pull.mjs). Nothing is fabricated.

import rawData from '@/data/licensing-index.json';
import { LICENCE_STATES, type StateLicence } from './labour-hire-licence';

export const LICENSING_INDEX_PATH = '/labour-hire-licensing-index';
export const LICENSING_INDEX_LICENSE = 'https://creativecommons.org/licenses/by/4.0/';

export interface IndexMetrics {
  activeProviders: number | null;
  suspended: number | null;
  cancelled: number | null;
  pendingApplications: number | null;
}

export interface IndexRow {
  slug: string;
  state: string;
  abbr: string;
  hasScheme: boolean;
  act?: string | undefined;
  regulator?: string | undefined;
  registerUrl?: string | undefined;
  /** Captured metrics for scheme jurisdictions; null where no scheme. */
  metrics: IndexMetrics | null;
}

interface RegisterEntry {
  registerUrl: string;
  enforcementUrl?: string;
  metrics: IndexMetrics;
}

const data = rawData as {
  schemaVersion: number;
  capturedAt: string;
  saTransitionDeadline: string;
  notes: string;
  registers: Record<string, RegisterEntry>;
};

export const LICENSING_INDEX_CAPTURED_AT = data.capturedAt;
export const SA_TRANSITION_DEADLINE = data.saTransitionDeadline;

/** The metrics the Index measures (drives variableMeasured + the table). */
export const INDEX_METRICS: { key: keyof IndexMetrics; label: string }[] = [
  { key: 'activeProviders', label: 'Active licensed providers' },
  { key: 'suspended', label: 'Suspended licences' },
  { key: 'cancelled', label: 'Cancelled licences' },
  { key: 'pendingApplications', label: 'Pending applications' },
];

function toRow(s: StateLicence): IndexRow {
  const reg = data.registers[s.slug];
  return {
    slug: s.slug,
    state: s.state,
    abbr: s.abbr,
    hasScheme: s.hasScheme,
    act: s.act,
    regulator: s.regulator,
    registerUrl: reg?.registerUrl,
    metrics: reg ? reg.metrics : null,
  };
}

/** Full cross-jurisdiction snapshot (scheme states carry register + metrics). */
export function getLicensingIndexRows(): IndexRow[] {
  return LICENCE_STATES.map(toRow);
}

/**
 * Whole days from `from` (default today) until the SA transition deadline.
 * Negative once the deadline has passed. `from` is injectable for testing.
 */
export function daysUntilSADeadline(from: Date = new Date()): number {
  const deadline = new Date(`${SA_TRANSITION_DEADLINE}T00:00:00Z`);
  const fromUtc = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((deadline.getTime() - fromUtc) / MS_PER_DAY);
}

/** The committed dataset, served verbatim as the Dataset distribution. */
export function licensingIndexJson(): string {
  return JSON.stringify(rawData, null, 2);
}
