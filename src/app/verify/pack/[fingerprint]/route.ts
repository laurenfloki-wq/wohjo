// FLOSTRUCTION — public pack verify surface (M4-J).
//
// GET /verify/pack/[fingerprint]
//
// No auth. The showcase exhibit; the most conservative surface in
// the system. Per the substrate review's Phase 1 fold-in:
//
//   - existence + integrity + inclusion proof only
//   - event_chain_segment carries {event_hash, previous_event_hash}
//     ONLY — NO event_type, NO spec_version
//   - NO pack_summary, worker_count, total_hours, period boundaries
//   - generated_at coarsened to YYYY-MM-DD (date) so the precise
//     export timing is not attributable to a known org
//   - 404 for miss AND malformed fingerprint — same body shape and
//     same latency so the surface never reveals whether a given
//     fingerprint corresponds to an existing pack without the exact
//     64-hex input
//
// The authenticated Evidence Pack PDF carries the full
// human-readable summary; this surface deliberately doesn't.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { routeLogger } from '@/lib/logger';

const FINGERPRINT_RE = /^[0-9a-f]{64}$/;

/**
 * 404 response shared by both miss and malformed input. Body and
 * Content-Type are identical so a caller cannot tell the two apart
 * by the response shape alone.
 */
function notFoundResponse(): Response {
  return new NextResponse(
    JSON.stringify({ error: 'not_found' }),
    { status: 404, headers: { 'content-type': 'application/json' } },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fingerprint: string }> },
): Promise<Response> {
  const log = routeLogger('GET /verify/pack/:fingerprint', null);

  const { fingerprint } = await params;

  // Malformed fingerprint: 404 (not 400), no distinguishing body or
  // latency. The DB lookup is intentionally still performed against a
  // sentinel value so the network-timing profile is similar for
  // miss vs malformed — defence in depth.
  const supabase = createServiceClient();
  const lookupValue = FINGERPRINT_RE.test(fingerprint) ? fingerprint : '_'.repeat(64);

  const { data: pack } = await supabase
    .from('export_packs')
    .select(
      'id, pack_fingerprint, canonical_manifest_jsonb, generated_at, audit_pack_storage_path',
    )
    .eq('pack_fingerprint', lookupValue)
    .maybeSingle();

  if (!pack || !FINGERPRINT_RE.test(fingerprint)) {
    return notFoundResponse();
  }

  const manifest = (pack as {
    canonical_manifest_jsonb: {
      bridge_event_hash?: string;
      v1_chain_tip_hash?: string;
      frozen_anchor?: {
        id?: string; fingerprint?: string; count?: number;
        formula?: string; bound_at?: string; scope?: string;
      };
      shifts?: Array<{
        event_chain_segment?: Array<{
          event_hash: string; previous_event_hash: string;
        }>;
      }>;
    };
    generated_at: string;
    pack_fingerprint: string;
  }).canonical_manifest_jsonb;

  // Inclusion proof: aggregate {event_hash, previous_event_hash}
  // tuples across every shift in the pack. Order preserved as
  // canonicalised.
  const segment: Array<{ event_hash: string; previous_event_hash: string }> = [];
  for (const s of manifest.shifts ?? []) {
    for (const e of s.event_chain_segment ?? []) {
      segment.push({
        event_hash: e.event_hash,
        previous_event_hash: e.previous_event_hash,
      });
    }
  }

  // Live chain-integrity at this moment of verification. Reads
  // count_broken_chain_links() and reports intact/broken without
  // disclosing which company or row is affected.
  let integrity = 'intact' as 'intact' | 'broken';
  try {
    const { data: chk } = await supabase.rpc('count_broken_chain_links');
    if (typeof chk === 'number' && chk > 0) {
      integrity = 'broken';
    }
  } catch {
    // RPC failure is itself a verification problem — surface, don't hide.
    integrity = 'broken';
  }

  // generated_at coarsened to YYYY-MM-DD per the fold-in.
  const generatedDate = (pack as { generated_at: string }).generated_at.slice(0, 10);

  log.info({ fingerprint, integrity }, 'verify.pack.hit');

  return NextResponse.json({
    pack_fingerprint: (pack as { pack_fingerprint: string }).pack_fingerprint,
    exists: true,
    spec_version: '1.0',
    generated_at_date: generatedDate,
    inclusion_proof: {
      anchor: manifest.frozen_anchor
        ? {
            id: manifest.frozen_anchor.id,
            scope: manifest.frozen_anchor.scope,
            formula: manifest.frozen_anchor.formula,
            fingerprint: manifest.frozen_anchor.fingerprint,
            count: manifest.frozen_anchor.count,
          }
        : null,
      bridge_event_hash: manifest.bridge_event_hash ?? null,
      chain_tip_at_pack: manifest.v1_chain_tip_hash ?? null,
      event_chain_segment: segment,
    },
    chain_integrity_at_verification: integrity,
  });
}
