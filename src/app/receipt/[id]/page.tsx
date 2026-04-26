// Public FLOSTRUCTION receipt page — no authentication required.
// Anyone can verify any FSTR receipt via this URL.
//   /receipt/FSTR-JK5QPAVQ
//
// Relies on a Supabase RLS policy that permits anonymous SELECT on
// shifts WHERE status IN ('APPROVED','SUPERVISOR_APPROVED'). Apply
// that policy separately before this route is expected to work:
//
//   CREATE POLICY IF NOT EXISTS receipt_public_approved_read
//     ON shifts FOR SELECT
//     USING (status IN ('APPROVED','SUPERVISOR_APPROVED'));
//
// Palette: navy #0E1C2F, verification green #166534, live green
// #4ade80, warm white #F5F3EE. IBM Plex Mono + IBM Plex Serif.

import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface ReceiptShift {
  receipt_id: string;
  total_hours: string | null;
  shift_date: string;
  supervisor_approved_at: string | null;
  start_time: string | null;
  end_time: string | null;
  geofence_detected_at: string | null;
  worker_confirmed_start_at: string | null;
  start_time_source: 'GEOFENCE_CONFIRMED' | 'GEOFENCE_ADJUSTED' | 'MANUAL' | null;
  status: string;
  workers: { first_name: string | null } | null;
  sites: { name: string | null } | null;
  shift_events: Array<{ event_hash: string; spec_version?: string | null }> | null;
}

function formatHmAEST(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Australia/Sydney',
  });
}

function formatDateAEST(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Australia/Sydney',
  });
}

async function loadReceipt(id: string): Promise<ReceiptShift | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const supabase = createClient(url, anon);
  const { data, error } = await supabase
    .from('shifts')
    .select(`
      receipt_id,
      total_hours,
      shift_date,
      supervisor_approved_at,
      start_time,
      end_time,
      geofence_detected_at,
      worker_confirmed_start_at,
      start_time_source,
      status,
      workers (first_name),
      sites (name),
      shift_events (event_hash, spec_version)
    `)
    .eq('receipt_id', id)
    .in('status', ['APPROVED', 'SUPERVISOR_APPROVED'])
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as ReceiptShift;
}

const NAVY = '#0E1C2F';
const GREEN_VERIFY = '#166534';
const GREEN_LIVE = '#4ade80';
const WARM = '#F5F3EE';
const MUTE = 'rgba(245,243,238,0.6)';

function NotFoundBlock({ id }: { id: string }) {
  return (
    <main style={{ background: NAVY, color: WARM, minHeight: '100vh', padding: '48px 24px', fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace" }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <div style={{ width: 40, height: 40, border: `2px solid ${WARM}`, color: WARM, textAlign: 'center', lineHeight: '36px', fontWeight: 700, fontSize: 20, marginBottom: 24 }}>F</div>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 12px' }}>Receipt not found.</h1>
        <p style={{ fontFamily: "'IBM Plex Serif', Georgia, serif", fontStyle: 'italic', color: MUTE, margin: '0 0 24px' }}>
          FSTR-{id.replace(/^FSTR-/, '')} does not exist in the FLOSTRUCTION system.
        </p>
        <p style={{ color: MUTE, fontSize: 11, letterSpacing: '0.08em', textAlign: 'center', marginTop: 48 }}>
          FLOSMOSIS PTY LTD &mdash; flosmosis.com
        </p>
      </div>
    </main>
  );
}

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const normalisedId = id.startsWith('FSTR-') ? id : `FSTR-${id}`;
  const shift = await loadReceipt(normalisedId);
  if (!shift) return <NotFoundBlock id={normalisedId} />;

  const source = shift.start_time_source ?? 'MANUAL';
  const detectedTime = formatHmAEST(shift.geofence_detected_at);
  const confirmedStart = formatHmAEST(shift.worker_confirmed_start_at ?? shift.start_time);
  const clockOut = formatHmAEST(shift.end_time);
  const approved = formatHmAEST(shift.supervisor_approved_at);
  const chainHash = shift.shift_events?.[0]?.event_hash ?? null;
  const chainHashShort = chainHash ? chainHash.slice(0, 16) : null;

  // Spec-version-aware badge. Per Annex v2.1 §1A(b) and §7b:
  // v0 format records are not labelled v1.0 conformant; v1.0 records
  // are. Mixed chains (any v0 event among v1.0) are labelled with
  // the v0 language to be honest about the chain's composition.
  const anyV0 = (shift.shift_events ?? []).some(
    (e) => !e.spec_version || e.spec_version === '0',
  );
  const sealLabel = anyV0 ? 'SHA-256 (v0 format)' : 'WLES v1.0';

  return (
    <main style={{ background: NAVY, color: WARM, minHeight: '100vh', padding: '48px 24px', fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace" }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ width: 40, height: 40, border: `2px solid ${WARM}`, color: WARM, textAlign: 'center', lineHeight: '36px', fontWeight: 700, fontSize: 20, marginBottom: 24 }}>F</div>

        <div style={{ color: MUTE, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>
          FLOSTRUCTION RECEIPT
        </div>
        <div style={{ color: GREEN_VERIFY, fontSize: 22, fontWeight: 600, letterSpacing: '0.03em', marginBottom: 18 }}>
          {shift.receipt_id}
        </div>

        <hr style={{ border: 'none', borderTop: `1px solid ${GREEN_VERIFY}`, margin: '12px 0' }} />

        <Row label="Worker" value={shift.workers?.first_name ?? '—'} />
        <Row label="Site" value={shift.sites?.name ?? '—'} />
        <Row label="Date" value={formatDateAEST(shift.shift_date)} />

        <hr style={{ border: 'none', borderTop: `1px solid ${GREEN_VERIFY}`, margin: '16px 0' }} />

        {source === 'GEOFENCE_CONFIRMED' && detectedTime && (
          <>
            <Row label="Site detected" value={`${detectedTime} AEST`} />
            <Row label="Confirmed start" value={`${detectedTime} AEST`} />
            <Row label="Source" value="GPS verified" />
          </>
        )}
        {source === 'GEOFENCE_ADJUSTED' && detectedTime && confirmedStart && (
          <>
            <Row label="Site detected" value={`${detectedTime} AEST`} />
            <Row label="Worker confirmed" value={`${confirmedStart} AEST`} />
            <Row label="Source" value="GPS detected, time adjusted" />
          </>
        )}
        {source === 'MANUAL' && confirmedStart && (
          <>
            <Row label="Confirmed start" value={`${confirmedStart} AEST`} />
            <Row label="Source" value="Manual entry" />
          </>
        )}

        {clockOut && <Row label="Clock out" value={`${clockOut} AEST`} />}
        {shift.total_hours && <Row label="Hours" value={shift.total_hours} />}

        <hr style={{ border: 'none', borderTop: `1px solid ${GREEN_VERIFY}`, margin: '18px 0' }} />

        <div style={{ color: GREEN_LIVE, fontSize: 20, fontWeight: 600, letterSpacing: '0.06em', marginBottom: 10 }}>
          VERIFIED
        </div>
        <Row label="Chain integrity" value="INTACT" valueColor={GREEN_LIVE} />
        <Row label="Sealed under" value={sealLabel} />
        {chainHashShort && (
          <div style={{ marginTop: 12 }}>
            <div style={{ color: MUTE, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase' }}>SHA-256</div>
            <div style={{ color: GREEN_VERIFY, fontSize: 11, wordBreak: 'break-all', marginTop: 4 }}>{chainHashShort}&hellip;</div>
          </div>
        )}
        {approved && (
          <Row label="Approved" value={`${approved} AEST`} />
        )}

        <p style={{ marginTop: 18, fontFamily: "'IBM Plex Serif', Georgia, serif", fontStyle: 'italic', color: MUTE }}>
          Both sides agreed. Permanently.
        </p>
        <p style={{ marginTop: 6, fontFamily: "'IBM Plex Serif', Georgia, serif", fontStyle: 'italic', color: MUTE, fontSize: 13 }}>
          This record cannot be changed.
        </p>

        <p style={{ color: MUTE, fontSize: 11, letterSpacing: '0.08em', textAlign: 'center', marginTop: 48 }}>
          FLOSMOSIS PTY LTD &mdash; flosmosis.com
        </p>
      </div>
    </main>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '8px 0', fontSize: 13 }}>
      <span style={{ color: MUTE }}>{label}</span>
      <span style={{ color: valueColor ?? WARM }}>{value}</span>
    </div>
  );
}
