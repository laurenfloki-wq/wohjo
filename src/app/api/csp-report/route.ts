// CRACK 211 — CSP violation report endpoint
// Source spec: Cowork CSP Integration Spec, Notion 35b06f9432dd812fade2ea05b9351859
//
// Browsers POST violation reports here when something on a page would be
// blocked by the Report-Only policy set in src/middleware.ts. The endpoint
// is intentionally minimal:
//
//   * No auth — browsers do not send credentials with CSP reports.
//   * Body cap of 10 KB — the W3C-shape body should be a few hundred bytes;
//     anything larger is abuse.
//   * 100 reports/min/IP — hard cap so a misbehaving page or attacker can't
//     flood the log stream.
//   * Logged via pino to stdout. Vercel scoops stdout into the runtime log
//     stream. NO Supabase write — that would risk a CSP-violation feedback
//     loop if the DB call itself ever caused a CSP violation.
//   * Always 204 — never 4xx/5xx. Browsers don't retry on error here, but
//     returning 4xx pollutes server logs and triggers no-op alerts.

import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 10 * 1024;
const RATE_LIMIT = { windowMs: 60_000, maxRequests: 100 };

interface CspReportEnvelope {
  'csp-report'?: Record<string, unknown>;
}

export async function POST(request: Request): Promise<Response> {
  const ip = getClientIP(request);
  const rl = checkRateLimit(`csp-report:${ip}`, RATE_LIMIT);
  if (!rl.allowed) {
    return new NextResponse(null, { status: 429 });
  }

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (contentLength > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  if (raw.length > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  let parsed: CspReportEnvelope | Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as CspReportEnvelope;
  } catch {
    // Browsers occasionally send empty / malformed reports. Log nothing,
    // return 204; pretending we processed it costs nothing and avoids
    // alerting on every malformed POST.
    return new NextResponse(null, { status: 204 });
  }

  const report =
    'csp-report' in parsed && parsed['csp-report'] && typeof parsed['csp-report'] === 'object'
      ? (parsed['csp-report'] as Record<string, unknown>)
      : (parsed as Record<string, unknown>);

  logger.warn(
    {
      event: 'csp_violation',
      blocked_uri: report['blocked-uri'] ?? null,
      violated_directive: report['violated-directive'] ?? null,
      effective_directive: report['effective-directive'] ?? null,
      document_uri: report['document-uri'] ?? null,
      referrer: report['referrer'] ?? null,
      source_file: report['source-file'] ?? null,
      line_number: report['line-number'] ?? null,
      column_number: report['column-number'] ?? null,
      original_policy_disposition: report['disposition'] ?? 'report',
    },
    'csp.violation',
  );

  return new NextResponse(null, { status: 204 });
}
