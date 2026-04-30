// Bulk worker import — Shape B v1 substrate exports.
//
// Data layer ONLY. UI lands in Shape B v2.
//
// Usage from a server-side route handler:
//
//   import { parseProviderCsv, bulkInsertWorkers } from '@/lib/onboarding/import';
//   import { createServiceClient } from '@/lib/supabase/server';
//
//   const { rows, errors } = parseProviderCsv('xero', csvText, company_id);
//   if (errors.length > 0) return /* surface row-level errors to caller */;
//   const result = await bulkInsertWorkers(rows, company_id, createServiceClient());
//   if (!result.ok) return /* surface DB error */;
//
// Five providers supported: 'xero' | 'myob' | 'employment-hero' |
// 'keypay' | 'micropay'.

import { parseXeroCsv } from './parsers/xero';
import { parseMyobCsv } from './parsers/myob';
import { parseEmploymentHeroCsv } from './parsers/employment-hero';
import { parseKeypayCsv } from './parsers/keypay';
import { parseMicropayCsv } from './parsers/micropay';
import type { ParseResult, Provider } from './types';

export { bulkInsertWorkers } from './bulk-insert';
export type { SupabaseLike } from './bulk-insert';
export type {
  WorkerImportRow,
  WorkerImportError,
  ParseResult,
  BulkImportResult,
  Provider,
} from './types';
export { parseXeroCsv } from './parsers/xero';
export { parseMyobCsv } from './parsers/myob';
export { parseEmploymentHeroCsv } from './parsers/employment-hero';
export { parseKeypayCsv } from './parsers/keypay';
export { parseMicropayCsv } from './parsers/micropay';

/**
 * Provider-dispatch parser. Convenience wrapper for callers that
 * receive the provider as a string (e.g. from a form submission).
 */
export function parseProviderCsv(
  provider: Provider,
  input: string,
  company_id: string,
): ParseResult {
  switch (provider) {
    case 'xero':
      return parseXeroCsv(input, company_id);
    case 'myob':
      return parseMyobCsv(input, company_id);
    case 'employment-hero':
      return parseEmploymentHeroCsv(input, company_id);
    case 'keypay':
      return parseKeypayCsv(input, company_id);
    case 'micropay':
      return parseMicropayCsv(input, company_id);
    default: {
      // Exhaustiveness guard — TS will catch new providers added to
      // the Provider union without a corresponding case here.
      const _exhaustive: never = provider;
      throw new Error(`parseProviderCsv: unknown provider ${String(_exhaustive)}`);
    }
  }
}
