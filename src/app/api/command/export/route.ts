// FLOSTRUCTION /command — Export route (M4-I).
// POST /api/command/export
//
// Three-phase exactly-once split per the Phase 1 fold-in:
//   PHASE 1  CLAIM     — read eligible shifts (no lock)
//   PHASE 2  GENERATE  — build manifest, render payroll-import file +
//                        Evidence Pack PDF, upload to Storage,
//                        pre-seal EXPORT_RECORD events. ZERO row locks
//                        held while Storage I/O is in flight.
//   PHASE 3  FINALISE  — call export_finalise RPC. Atomic:
//                        FOR UPDATE on shifts, idempotency check,
//                        chain-tail freshness check, INSERT pack +
//                        export + sealed events, flip shifts.
//
// Idempotency layers:
//   - export_packs.idempotency_key UNIQUE: replays return the prior
//     pack via the RPC's idempotency_check branch.
//   - shifts UPDATE compound predicate (status IN (...) AND
//     export_id IS NULL): concurrent winners produce CONCURRENT_EXPORTER.
//   - Chain-tail freshness: stale pre-sealed events produce
//     CHAIN_TAIL_MOVED; the route retries with a freshly resealed
//     batch, up to MAX_RETRIES.
//
// Body: { pay_period_start, pay_period_end, provider_id }
// Returns: { success, pack_id, pack_fingerprint, export_id,
//            verify_url, idempotent, shift_count, total_hours }

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { isWlesV1Enabled, isWlesTypeRegistryLocked } from '@/lib/wles/flags';
import { sealEvent } from '@/lib/wles/v1';
import { buildExportRecord } from '@/lib/wles/v1-translate';
import { getV1ChainTail } from '@/lib/wles/v1-chain';
import { getApprovedShifts } from '@/lib/export/get-approved-shifts';
import {
  buildPackManifest, manifestCanonicalBytes, packFingerprint,
  computeIdempotencyKey, hashBytes,
  type PackManifestInput, type PackShiftEntry,
} from '@/lib/exports/pack';
import {
  buildMyobXlsx, buildRfc4180Csv, TenantActivityMappingMissing,
  MYOB_XLSX_MIME, CSV_MIME, type PayrollFileRow,
} from '@/lib/exports/payroll-file';
import { renderPackPdfBuffer } from '@/lib/exports/pack-pdf';
import { loadTenantMappings } from '@/lib/exports/tenant-mappings';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/security/rate-limit';
import { routeLogger } from '@/lib/logger';

interface ExportRequestBody {
  pay_period_start: string;
  pay_period_end: string;
  provider_id: string;
  /** Tolerated for back-compat per CRACK 218; server-derived identity is authoritative. */
  admin_user_id?: string;
}

const FROZEN_ANCHOR_ID = 'FROZEN_ANCHOR_V0';
const PACK_FORMAT_VERSION = 'pack-v1.0';
const STORAGE_BUCKET_PAYROLL = 'flos-exports-private';
const STORAGE_BUCKET_PACK    = 'audit-packs';
const MAX_RETRIES = 3;

const VERIFY_URL_PREFIX = (() => {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') ?? 'https://flosmosis.com';
  return `${base}/verify/pack/`;
})();

export async function POST(request: Request): Promise<Response> {
  const log = routeLogger('POST /api/command/export', request.headers.get('x-request-id'));
  log.info({}, 'request.received');

  // Auth (CRACK 218: server-derived identity).
  let companyId: string;
  let adminUserId: string;
  try {
    ({ companyId, userId: adminUserId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  // Rate limit.
  const rl = checkRateLimit(`export:${getClientIP(request)}`, RATE_LIMITS.EXPORT);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  let body: ExportRequestBody;
  try {
    body = (await request.json()) as ExportRequestBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { pay_period_start, pay_period_end, provider_id } = body;
  if (!pay_period_start || !pay_period_end || !provider_id) {
    return NextResponse.json(
      { error: 'pay_period_start, pay_period_end, and provider_id required' },
      { status: 400 },
    );
  }

  if (!isWlesV1Enabled()) {
    return NextResponse.json(
      { error: 'WLES_V1_ENABLED must be set; v0 writes are blocked at the substrate post-cutover.' },
      { status: 500 },
    );
  }

  // Type-registry lock gate. This route pre-seals one EXPORT_RECORD
  // event per shift into the append-only chain. Append-only means
  // any event minted under a provisional payload event_type is
  // permanent — the chain cannot be re-stamped. Until Lauren has
  // locked the WLES v1.0 type-registry and confirmed the emitter +
  // §7 spec match (WLES_TYPE_REGISTRY_LOCKED=true in Vercel), this
  // route refuses to run. Same fail-closed pattern as the
  // bulk-upload route's WORKER_CREATED path.
  if (!isWlesTypeRegistryLocked()) {
    log.error({}, 'export.type_registry_unlocked');
    return NextResponse.json(
      {
        error: 'SETUP_BLOCKER_TYPE_REGISTRY_LOCK',
        message:
          'WLES_TYPE_REGISTRY_LOCKED must be set to true before any export can run. '
          + 'Exports pre-seal EXPORT_RECORD into the append-only chain; a pre-lock '
          + 'run would permanently mint events under a provisional payload type.',
        configure_at: 'Vercel preview env: WLES_TYPE_REGISTRY_LOCKED=true',
      },
      { status: 503 },
    );
  }

  const supabase = createServiceClient();

  // ─── PHASE 1: CLAIM ────────────────────────────────────────────
  const shifts = await getApprovedShifts({
    companyId,
    payPeriodStart: pay_period_start,
    payPeriodEnd: pay_period_end,
  });
  if (shifts.length === 0) {
    return NextResponse.json(
      { error: 'No approved shifts found for this pay period' },
      { status: 404 },
    );
  }
  const shiftIds = shifts.map((s) => s.id);
  const idempotencyKey = computeIdempotencyKey({
    company_id: companyId,
    pay_period_start,
    pay_period_end,
    shift_ids: shiftIds,
    export_target: provider_id,
  });

  // Idempotency fast-path: if a pack exists for this key, return it
  // without doing PHASE 2 work.
  const { data: existingPack } = await supabase
    .from('export_packs')
    .select('id, pack_fingerprint')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (existingPack) {
    const { data: existingExport } = await supabase
      .from('exports')
      .select('id')
      .eq('pack_id', (existingPack as { id: string }).id)
      .maybeSingle();
    return NextResponse.json({
      success: true,
      idempotent: true,
      pack_id: (existingPack as { id: string }).id,
      pack_fingerprint: (existingPack as { pack_fingerprint: string }).pack_fingerprint,
      export_id: (existingExport as { id: string } | null)?.id ?? null,
      verify_url: VERIFY_URL_PREFIX + (existingPack as { pack_fingerprint: string }).pack_fingerprint,
      shift_count: shifts.length,
      total_hours: shifts.reduce((a, s) => a + s.total_hours, 0).toFixed(2),
    });
  }

  // Tenant activity mappings (setup blocker if empty for MYOB).
  const { mappings: tenantMappings, setup_blocker } = await loadTenantMappings(
    supabase as unknown as Parameters<typeof loadTenantMappings>[0],
    companyId,
  );
  if (provider_id === 'myob' && setup_blocker) {
    return NextResponse.json(
      {
        error: 'SETUP_BLOCKER_TENANT_ACTIVITY_MAPPINGS',
        message: 'Configure tenant_activity_mappings before exporting to MYOB.',
        configure_at: '/command/payroll-mapping',
      },
      { status: 422 },
    );
  }

  // FROZEN_ANCHOR_V0 row from substrate_anchors — embedded in the
  // manifest so the pack is self-attesting against the pre-cutover
  // boundary.
  const { data: anchorRow, error: anchorErr } = await supabase
    .from('substrate_anchors')
    .select('id, scope_text, formula_text, expected_fingerprint, expected_count, bound_at')
    .eq('id', FROZEN_ANCHOR_ID)
    .single();
  if (anchorErr || !anchorRow) {
    return NextResponse.json(
      { error: `substrate anchor not found: ${anchorErr?.message ?? FROZEN_ANCHOR_ID}` },
      { status: 500 },
    );
  }

  // The bridge event — used to anchor the v1 chain in the manifest.
  const { data: bridgeRow } = await supabase
    .from('shift_events')
    .select('event_hash')
    .eq('company_id', companyId)
    .eq('event_type', 'X-FLOSMOSIS-SPEC_VERSION_MIGRATION')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const bridgeEventHash = (bridgeRow as { event_hash?: string } | null)?.event_hash ?? '';

  // Resolve event chain segments for each shift.
  const chainSegments = await Promise.all(
    shifts.map(async (s) => {
      const { data } = await supabase
        .from('shift_events')
        .select('event_hash, previous_event_hash, created_at')
        .eq('company_id', companyId)
        .or(`worker_id.eq.${s.worker_id}`)
        .order('created_at', { ascending: true });
      const all = (data ?? []) as Array<{ event_hash: string; previous_event_hash: string }>;
      return all.map((e) => ({
        event_hash: e.event_hash,
        previous_event_hash: e.previous_event_hash,
      }));
    }),
  );

  // Resolve myob_card_id per worker (not on ApprovedShift's flat shape).
  const workerIds = Array.from(new Set(shifts.map((s) => s.worker_id)));
  const { data: workerCards } = await supabase
    .from('workers')
    .select('id, myob_card_id')
    .in('id', workerIds);
  const cardById = new Map<string, string | null>(
    ((workerCards ?? []) as Array<{ id: string; myob_card_id: string | null }>)
      .map((w) => [w.id, w.myob_card_id]),
  );

  const packShifts: PackShiftEntry[] = shifts.map((s, i) => ({
    shift_id: s.id,
    receipt_id: s.receipt_id,
    worker_id: s.worker_id,
    shift_date: s.shift_date,
    total_hours_x100: Math.round(s.total_hours * 100),
    event_chain_segment: chainSegments[i] ?? [],
  }));

  // Payroll-file row shape per worker.
  const fileRows: PayrollFileRow[] = shifts.map((s) => ({
    employee_id: s.worker_employee_id,
    full_name: `${s.worker_first_name} ${s.worker_last_name}`.trim(),
    myob_card_id: cardById.get(s.worker_id) ?? null,
    shift_date: s.shift_date,
    total_hours: Number(s.total_hours.toFixed(2)),
    category: 'ordinary_hours',
    receipt_id: s.receipt_id,
  }));

  let lastError = '';
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // ─── PHASE 2: GENERATE ─────────────────────────────────────
      // Chain tail at THIS moment. If concurrent v1 minting happens
      // between PHASE 2 and PHASE 3, the RPC raises CHAIN_TAIL_MOVED
      // and we retry below with a fresh tail.
      const chainTailAtSeal = await getV1ChainTail(
        supabase as unknown as Parameters<typeof getV1ChainTail>[0],
        companyId,
      );

      // Payroll-import artefact (A).
      let payrollBytes: Buffer;
      let payrollMime: string;
      let payrollExt: string;
      if (provider_id === 'myob') {
        try {
          payrollBytes = buildMyobXlsx({
            rows: fileRows,
            mappings: tenantMappings,
            company_name: companyId,
            pay_period_start,
            pay_period_end,
          });
        } catch (mapErr) {
          if (mapErr instanceof TenantActivityMappingMissing) {
            return NextResponse.json(
              {
                error: 'SETUP_BLOCKER_TENANT_ACTIVITY_MAPPINGS',
                missing_categories: mapErr.missing,
                configure_at: '/command/payroll-mapping',
              },
              { status: 422 },
            );
          }
          throw mapErr;
        }
        payrollMime = MYOB_XLSX_MIME;
        payrollExt = 'xlsx';
      } else {
        payrollBytes = buildRfc4180Csv({ rows: fileRows, mappings: tenantMappings });
        payrollMime = CSV_MIME;
        payrollExt = 'csv';
      }
      const payrollFileHash = hashBytes(payrollBytes);

      // Build the manifest + fingerprint BEFORE rendering the PDF
      // so the PDF can embed the fingerprint on its first page.
      const manifestInputCanonical: PackManifestInput = buildPackManifest({
        pack_format_version: PACK_FORMAT_VERSION,
        company_id: companyId,
        pay_period_start,
        pay_period_end,
        export_target: provider_id,
        idempotency_key: idempotencyKey,
        v1_chain_tip_hash: chainTailAtSeal,
        frozen_anchor: {
          id: FROZEN_ANCHOR_ID,
          fingerprint: (anchorRow as { expected_fingerprint: string }).expected_fingerprint,
          count: (anchorRow as { expected_count: number }).expected_count,
          formula: (anchorRow as { formula_text: string }).formula_text,
          bound_at: (anchorRow as { bound_at: string }).bound_at,
          scope: (anchorRow as { scope_text: string }).scope_text,
        },
        bridge_event_hash: bridgeEventHash,
        shifts: packShifts,
      });
      const fingerprint = packFingerprint(manifestInputCanonical);

      // Evidence Pack PDF (B).
      const pdfBuffer = await renderPackPdfBuffer({
        manifest: manifestInputCanonical,
        pack_fingerprint: fingerprint,
        verify_url: VERIFY_URL_PREFIX + fingerprint,
        company_name: companyId,
        display_rows: shifts.map((s) => ({
          worker_name: `${s.worker_first_name} ${s.worker_last_name}`.trim(),
          shift_id_short: s.id.slice(0, 13),
          shift_date: s.shift_date,
          total_hours: Number(s.total_hours.toFixed(2)),
          receipt_id: s.receipt_id,
        })),
      });
      const auditPackHash = hashBytes(pdfBuffer);

      // Storage paths follow the bucket RLS convention
      // <bucket>/<company_id>/<period>/<file>. The path is committed
      // to the manifest fingerprint so a tampered re-upload at a
      // different path cannot be passed off as the same pack.
      const periodSeg = `${pay_period_start}_to_${pay_period_end}`;
      const payrollPath = `${companyId}/${periodSeg}/payroll-${fingerprint}.${payrollExt}`;
      const packPath    = `${companyId}/${periodSeg}/pack-${fingerprint}.pdf`;

      const payrollUp = await supabase.storage
        .from(STORAGE_BUCKET_PAYROLL)
        .upload(payrollPath, payrollBytes, { contentType: payrollMime, upsert: true });
      if (payrollUp.error) {
        throw new Error(`payroll upload failed: ${payrollUp.error.message ?? 'unknown'}`);
      }

      const packUp = await supabase.storage
        .from(STORAGE_BUCKET_PACK)
        .upload(packPath, pdfBuffer, { contentType: 'application/pdf', upsert: true });
      if (packUp.error) {
        throw new Error(`pack upload failed: ${packUp.error.message ?? 'unknown'}`);
      }

      // Pre-seal EXPORT_RECORD events chained off chainTailAtSeal.
      // We allocate a placeholder export_id for the payload — the
      // RPC will replace export_id mention via event_data after the
      // INSERT. For the sealed payload, we use the FINGERPRINT as a
      // deterministic surrogate so the seal can be computed now.
      let prev = chainTailAtSeal;
      const sealedEvents = shifts.map((s) => {
        const unsealed = buildExportRecord({
          actorId: adminUserId,
          subjectId: s.worker_id,
          timestamp: new Date().toISOString(),
          previousEventHash: prev,
          shiftId: s.id,
          exportId: fingerprint,    // deterministic surrogate; replaced in event_data
          provider: provider_id,
          fileHash: payrollFileHash,
        });
        const sealed = sealEvent(unsealed);
        prev = sealed.event_hash;
        return {
          worker_id: s.worker_id,
          site_id: s.site_id ?? '',
          event_data: {
            shift_id: s.id,
            receipt_id: s.receipt_id,
            export_id: fingerprint,
            provider: provider_id,
            file_hash: payrollFileHash,
          },
          event_hash: sealed.event_hash,
          previous_event_hash: sealed.previous_event_hash,
          wles_event: sealed,
          created_by: adminUserId,
        };
      });

      // ─── PHASE 3: FINALISE (RPC) ───────────────────────────────
      const totalHours = shifts.reduce((a, s) => a + s.total_hours, 0);
      const { data: rpcResult, error: rpcErr } = await supabase.rpc('export_finalise', {
        p_company_id: companyId,
        p_admin_user_id: adminUserId,
        p_idempotency_key: idempotencyKey,
        p_shift_ids: shiftIds,
        p_chain_tail_at_seal: chainTailAtSeal,
        p_pack_data: {
          canonical_manifest_jsonb: JSON.parse(manifestCanonicalBytes(manifestInputCanonical)),
          pack_fingerprint: fingerprint,
          payroll_file_storage_path: payrollPath,
          payroll_file_mime: payrollMime,
          payroll_file_hash: payrollFileHash,
          audit_pack_storage_path: packPath,
          audit_pack_mime: 'application/pdf',
          audit_pack_hash: auditPackHash,
        },
        p_export_data: {
          pay_period_start,
          pay_period_end,
          export_target: provider_id,
          total_shifts: shifts.length,
          total_hours: totalHours.toFixed(2),
          file_hash: payrollFileHash,
          payroll_file_storage_path: payrollPath,
          payroll_file_mime: payrollMime,
        },
        p_events: sealedEvents,
      });

      if (rpcErr) {
        const msg = rpcErr.message ?? '';
        if (msg.includes('CHAIN_TAIL_MOVED')) {
          log.warn({ attempt, msg }, 'export.chain_tail_moved.retrying');
          lastError = msg;
          continue;        // retry with a fresh seal
        }
        if (msg.includes('CONCURRENT_EXPORTER')) {
          return NextResponse.json(
            { error: 'CONCURRENT_EXPORTER', message: msg },
            { status: 409 },
          );
        }
        if (msg.startsWith('FORBIDDEN')) {
          return NextResponse.json({ error: 'FORBIDDEN', message: msg }, { status: 403 });
        }
        throw new Error(`finalise RPC failed: ${msg}`);
      }

      const out = rpcResult as { idempotent: boolean; pack_id: string; export_id: string };
      return NextResponse.json({
        success: true,
        idempotent: out.idempotent,
        pack_id: out.pack_id,
        pack_fingerprint: fingerprint,
        export_id: out.export_id,
        verify_url: VERIFY_URL_PREFIX + fingerprint,
        shift_count: shifts.length,
        total_hours: totalHours.toFixed(2),
      });
    } catch (loopErr) {
      lastError = loopErr instanceof Error ? loopErr.message : String(loopErr);
      log.error({ attempt, err: lastError }, 'export.attempt_failed');
      if (attempt === MAX_RETRIES - 1) break;
    }
  }

  return NextResponse.json(
    { error: 'export failed after retries', detail: lastError },
    { status: 500 },
  );
}
