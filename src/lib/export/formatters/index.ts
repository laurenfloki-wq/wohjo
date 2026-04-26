// Flostruction Export — Formatter Registry
// Lookup table for all payroll provider formatters.
// To add a new provider: create a new file, implement ExportFormatter, add to this map.

import type { ExportFormatter } from '../types';
import { EmploymentHeroFormatter } from './employment-hero';
import { XeroFormatter } from './xero';
import { MYOBFormatter } from './myob';
import { MicropayFormatter } from './micropay';

const formatters: Record<string, ExportFormatter> = {
  [EmploymentHeroFormatter.providerId]: EmploymentHeroFormatter,
  [XeroFormatter.providerId]: XeroFormatter,
  [MYOBFormatter.providerId]: MYOBFormatter,
  [MicropayFormatter.providerId]: MicropayFormatter,
};

/**
 * Get a formatter by provider ID. Throws if not found.
 */
export function getFormatter(providerId: string): ExportFormatter {
  const formatter = formatters[providerId];
  if (!formatter) {
    throw new Error(`Unknown export provider: "${providerId}". Available: ${Object.keys(formatters).join(', ')}`);
  }
  return formatter;
}

/**
 * List all registered formatters (for UI dropdowns).
 */
export function listFormatters(): Array<{ providerId: string; providerName: string }> {
  return Object.values(formatters).map((f) => ({
    providerId: f.providerId,
    providerName: f.providerName,
  }));
}

export { EmploymentHeroFormatter } from './employment-hero';
export { XeroFormatter } from './xero';
export { MYOBFormatter } from './myob';
export { MicropayFormatter } from './micropay';
