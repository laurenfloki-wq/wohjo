// Public Evidence-Pack verification — the shared core behind /verify.
//
// Sessionless and cross-company BY DESIGN: the caller proves authority
// by holding the capability token (the export's file_hash), not by a
// login. So this uses the deliberately loud system accessor, same
// discipline as the chain-verify cron (PR #71 precedent).
//
// Resolution: token (file_hash) -> exports row -> period + company ->
// generateAuditPack, which re-runs the SPEC-AWARE hash-chain
// verification against the live ledger. The result is therefore never
// self-asserting: "VERIFIED" means the mathematics was re-checked at
// request time, not that a document said so.

import { getServiceClientForSystemJob } from '@/lib/db/service-client';
import { generateAuditPack } from './generate-audit-pack';
import { isValidVerifyToken } from './verify-url';
import type { AuditPack } from './types';

export interface VerifyExportMeta {
  exportId: string;
  companyId: string;
  provider: string | null;
  fileHash: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  exportedAt: string | null;
}

export interface VerifyResult {
  found: boolean;
  meta?: VerifyExportMeta;
  pack?: AuditPack;
}

interface ExportLookupRow {
  id: string;
  company_id: string;
  export_target: string | null;
  file_hash: string;
  pay_period_start: string | null;
  pay_period_end: string | null;
  exported_at: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Verify a kept run by its capability token. Returns { found: false }
 * for an unknown/malformed token (the document may be altered or was
 * never issued); otherwise the export metadata plus the freshly
 * re-verified audit pack.
 */
export async function verifyPackByToken(token: string): Promise<VerifyResult> {
  if (!isValidVerifyToken(token)) return { found: false };

  const supabase = getServiceClientForSystemJob();
  const { data, error } = await supabase
    .from('exports')
    .select(
      'id, company_id, export_target, file_hash, pay_period_start, pay_period_end, exported_at',
    )
    .eq('file_hash', token)
    .order('exported_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`verify lookup failed: ${error.message}`);
  if (!data) return { found: false };

  const row = data as unknown as ExportLookupRow;

  const fallback = row.exported_at ? row.exported_at.slice(0, 10) : null;
  const periodStart = row.pay_period_start ?? fallback;
  const periodEnd = row.pay_period_end ?? periodStart;
  if (!periodStart || !periodEnd || !DATE_RE.test(periodStart) || !DATE_RE.test(periodEnd)) {
    return { found: false };
  }

  const pack = await generateAuditPack({
    companyId: row.company_id,
    periodStart,
    periodEnd,
  });

  return {
    found: true,
    meta: {
      exportId: row.id,
      companyId: row.company_id,
      provider: row.export_target,
      fileHash: row.file_hash,
      payPeriodStart: periodStart,
      payPeriodEnd: periodEnd,
      exportedAt: row.exported_at,
    },
    pack,
  };
}
