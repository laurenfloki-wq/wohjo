// WLES v1.0 — chain persistence helpers.
//
// Wraps the mechanical work of persisting a sealed v1.0 event into
// the shift_events table. Two operations:
//
//   getV1ChainTail(supabase, companyId)
//     → the event_hash of the most recent v1.0 event for this
//       company, to be used as previous_event_hash for the next
//       event. If no v1.0 event exists yet, this function seals
//       and inserts a bridge event per Annex v2.1 §4c and returns
//       the bridge event's hash.
//
//   insertV1Event(supabase, sealed, rowMeta)
//     → writes a sealed WlesEvent into shift_events with
//       spec_version='1.0' and the full event stored as the
//       wles_event jsonb column.
//
// Callers — the 8 API routes per transition policy §5c — use these
// helpers only when `isWlesV1Enabled()` returns true. When the
// feature flag is off, the legacy v0 sealing path is used and
// these helpers are not invoked.

import { ZERO_HASH } from './v1-types';
import { sealEvent } from './v1';
import { buildSpecVersionMigration } from './v1-translate';
import type { WlesEvent } from './v1-types';

/**
 * The fixed actor UUID representing the FLOSMOSIS system operator.
 * Used for system-actor events: the bridge event and automated
 * INTELLIGENCE_CLEAR events. Opaque identifier — the mapping to
 * "FLOSMOSIS operations" is outside the WLES chain, consistent
 * with WLES v1.0 §4.5 actor_id requirements.
 */
export const FLOSMOSIS_SYSTEM_ACTOR_ID = 'ffffffff-0000-0000-0000-000000000000';

// Minimal Supabase client surface this module uses. We don't import
// the full SupabaseClient type to avoid coupling this module's
// type surface to a specific @supabase/supabase-js version.
export interface SupabaseLike {
  from(table: string): {
    select: (cols: string) => {
      eq: (
        col: string,
        val: unknown,
      ) => {
        eq: (
          col: string,
          val: unknown,
        ) => {
          order: (
            col: string,
            opts: { ascending: boolean },
          ) => {
            limit: (n: number) => {
              maybeSingle: () => Promise<{ data: { event_hash: string } | null; error: unknown }>;
            };
          };
        };
      } & {
        or?: unknown;
        order?: unknown;
      };
    };
    insert: (row: Record<string, unknown>) =>
      | {
          select: (cols: string) => {
            single: () => Promise<{
              data: { id: string } | null;
              error: { message?: string } | null;
            }>;
          };
        }
      | Promise<{ data: unknown; error: { message?: string } | null }>;
  };
}

/**
 * Fetch the event_hash of the most recent v1.0 event for the given
 * company. If none exists, create a bridge event and return its
 * hash.
 *
 * Concurrency note: at pilot scale this implementation tolerates a
 * theoretical race where two concurrent requests for the same
 * company could each insert a bridge event. The daily chain-verify
 * cron catches the resulting chain break. In Phase 1.5, upgrade to
 * an advisory-lock-based approach.
 */
export async function getV1ChainTail(supabase: SupabaseLike, companyId: string): Promise<string> {
  // Look for an existing v1.0 event for this company, any type.
  const { data: lastV1 } = await (supabase as any)
    .from('shift_events')
    .select('event_hash')
    .eq('company_id', companyId)
    .eq('spec_version', '1.0')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastV1?.event_hash) return lastV1.event_hash;

  // No v1.0 events yet for this company — seal and insert the bridge.
  return createBridgeEvent(supabase, companyId);
}

/**
 * Seal and insert the X-FLOSMOSIS-SPEC_VERSION_MIGRATION bridge
 * event for the given company. Returns the bridge's event_hash for
 * downstream chain-linking.
 */
export async function createBridgeEvent(
  supabase: SupabaseLike,
  companyId: string,
): Promise<string> {
  // Find the company's v0 chain tail, if any, to include in the
  // bridge payload as `from_chain_tail_hash`.
  const { data: lastV0 } = await (supabase as any)
    .from('shift_events')
    .select('event_hash')
    .eq('company_id', companyId)
    .eq('spec_version', '0')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const v0TailHash: string = lastV0?.event_hash ?? ZERO_HASH;

  const unsealed = buildSpecVersionMigration({
    actorId: FLOSMOSIS_SYSTEM_ACTOR_ID,
    subjectId: companyId,
    timestamp: new Date().toISOString(),
    previousEventHash: ZERO_HASH,
    fromSpecVersion: '0',
    toSpecVersion: '1.0',
    fromChainTailHash: v0TailHash,
    reason: 'Reference implementation conformance activation',
  });
  const sealed = sealEvent(unsealed);

  const insertResult = await (supabase as any).from('shift_events').insert({
    company_id: companyId,
    worker_id: null,
    site_id: null,
    event_type: sealed.event_type,
    event_data: {},
    device_metadata: {},
    event_hash: sealed.event_hash,
    previous_event_hash: ZERO_HASH,
    created_by: 'system:wles-v1-activation',
    spec_version: '1.0',
    wles_event: sealed,
  });

  if (insertResult?.error) {
    throw new Error(
      `createBridgeEvent failed for company ${companyId}: ${insertResult.error.message ?? 'unknown'}`,
    );
  }

  return sealed.event_hash;
}

// ──────────────────────────────────────────────────────────────────────
// Row-insertion helper for sealed events
// ──────────────────────────────────────────────────────────────────────

export interface V1EventRowMeta {
  companyId: string;
  workerId?: string | null;
  siteId?: string | null;
  createdBy: string;
  gpsLat?: string | null;
  gpsLng?: string | null;
  gpsAccuracyMetres?: string | null;
  deviceMetadata?: Record<string, unknown>;
  /**
   * Optional legacy event_data for /command views and cron routes
   * that still query event_data directly. Mirror the key domain
   * fields here for compatibility during the transition window.
   * Authoritative event content lives in wles_event.
   */
  eventDataCompat?: Record<string, unknown>;
  /**
   * Override for the substrate `event_type` column (migration m0d).
   *
   * The substrate column MUST carry the FLOSTRUCTION canonical bare
   * name (SUPERVISOR_APPROVAL / PAYROLL_APPROVAL / EXPORT_RECORD,
   * etc.) so it stays inside `shift_events_event_type_check` and
   * keys the bare-name CHECK constraints (correction_consistency,
   * event_data_shape). The WLES type (`APPROVAL`,
   * `X-FLOSMOSIS-EXPORT_RECORD`, …) lives ONLY in the wles_event jsonb.
   *
   * When omitted, the WLES `sealed.event_type` is written verbatim —
   * correct for events whose WLES type IS already a canonical substrate
   * name (e.g. SHIFT_COMMIT) or a protocol/meta X- extension that has
   * no bare-name equivalent (SPEC_VERSION_MIGRATION).
   */
  eventTypeForSubstrate?: string;
}

/**
 * Insert a sealed WLES v1.0 event into shift_events. Writes the
 * full sealed event as a jsonb blob in the `wles_event` column and
 * sets `spec_version='1.0'`. Callers obtain `sealed.previous_event_hash`
 * from `getV1ChainTail()` before calling `sealEvent()`.
 */
export async function insertV1Event(
  supabase: SupabaseLike,
  sealed: WlesEvent,
  rowMeta: V1EventRowMeta,
): Promise<{ id: string }> {
  const result: any = await (supabase as any)
    .from('shift_events')
    .insert({
      company_id: rowMeta.companyId,
      worker_id: rowMeta.workerId ?? null,
      site_id: rowMeta.siteId ?? null,
      // Substrate column carries the canonical bare name (m0d) when the
      // caller supplies one; otherwise the WLES type verbatim.
      event_type: rowMeta.eventTypeForSubstrate ?? sealed.event_type,
      event_data: rowMeta.eventDataCompat ?? {},
      device_metadata: rowMeta.deviceMetadata ?? {},
      gps_lat: rowMeta.gpsLat ?? null,
      gps_lng: rowMeta.gpsLng ?? null,
      gps_accuracy_metres: rowMeta.gpsAccuracyMetres ?? null,
      event_hash: sealed.event_hash,
      previous_event_hash: sealed.previous_event_hash,
      created_by: rowMeta.createdBy,
      spec_version: '1.0',
      wles_event: sealed,
    })
    .select('id')
    .single();

  if (result?.error || !result?.data) {
    throw new Error(`insertV1Event failed: ${result?.error?.message ?? 'unknown'}`);
  }
  return { id: result.data.id };
}
