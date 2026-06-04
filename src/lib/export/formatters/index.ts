// Flostruction Export — Formatter Registry.
// Only formatters that are fully implemented and validated are registered
// here. Stubs reserved for the Phase 2 public-API direction (Xero, MYOB
// CSV, Micropay) remain in the codebase as architectural placeholders
// per the Architecture D note on each file but are NOT registered, so
// `listFormatters()` only surfaces providers a customer can actually use.

import type { ExportFormatter } from '../types';
import { EmploymentHeroFormatter } from './employment-hero';

const formatters: Record<string, ExportFormatter> = {
  [EmploymentHeroFormatter.providerId]: EmploymentHeroFormatter,
};

export function getFormatter(providerId: string): ExportFormatter {
  const formatter = formatters[providerId];
  if (!formatter) {
    throw new Error(
      `Unknown or unsupported export provider: "${providerId}". Available: ${Object.keys(formatters).join(', ')}`,
    );
  }
  return formatter;
}

export function listFormatters(): Array<{ providerId: string; providerName: string }> {
  return Object.values(formatters).map((f) => ({
    providerId: f.providerId,
    providerName: f.providerName,
  }));
}

export { EmploymentHeroFormatter } from './employment-hero';
