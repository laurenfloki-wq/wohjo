// Lead prioritisation (P6). worker_band is captured but was unused for routing.
// Combine it with the overall exposure band into a simple, declarative priority
// a rep can read and sort on. Larger firm + more exposure = hotter lead. This
// is surfaced in the founder hand-off and the HubSpot Note/message — NOT a new
// HubSpot property.

import type { Band } from './types';

export interface LeadPriority {
  /** Human label for the hand-off / Note. */
  label: 'High' | 'Medium' | 'Low';
  /** Sortable rank (bigger = hotter): worker-band size × 10 + severity. */
  rank: number;
}

/** Worker-band → size rank (1 smallest … 5 largest). 0 if unknown. */
const BAND_SIZE: Record<string, number> = {
  '1-5': 1,
  '6-20': 2,
  '21-50': 3,
  '51-200': 4,
  '200+': 5,
};

const SEVERITY: Record<Band, number> = { exposed: 3, watch: 2, clear: 1, na: 0 };

export function leadPriority(workerBand: string | null, overall: Band): LeadPriority {
  const size = workerBand ? (BAND_SIZE[workerBand] ?? 0) : 0;
  const severity = SEVERITY[overall] ?? 0;
  const rank = size * 10 + severity;

  let label: LeadPriority['label'];
  if (overall === 'exposed' && size >= 4) label = 'High';
  else if (overall === 'exposed' || (overall === 'watch' && size >= 4)) label = 'Medium';
  else label = 'Low';

  return { label, rank };
}
