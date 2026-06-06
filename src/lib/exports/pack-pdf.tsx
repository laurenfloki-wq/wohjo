// FLOSTRUCTION — Evidence Pack PDF (M4-H).
//
// Non-authoritative rendering of a pack for human reading. The
// authoritative artefacts are the canonical JCS manifest (used to
// compute pack_fingerprint) and the WLES chain itself. The PDF
// embeds pack_fingerprint + the public verify URL + the FROZEN_ANCHOR_V0
// MD5 statement on its first page so any reader can verify
// independently:
//   pack_fingerprint = SHA-256 over the JCS canonical manifest bytes
//   audit_pack_hash  = SHA-256 over the bytes of THIS PDF as stored
//
// Both hashes live on export_packs (M4-E). The pack_fingerprint is
// the stable identifier referenced by /verify/pack/[fingerprint];
// the audit_pack_hash binds the rendered PDF specifically.

import React from 'react';
import {
  Document, Page, Text, View, StyleSheet, pdf,
} from '@react-pdf/renderer';
import type { PackManifestInput } from './pack';

const PALETTE = {
  ink: '#21201C',
  inkMuted: '#6B6760',
  rule: '#CFCEC8',
  cream: '#F5F2EA',
  verified: '#1F4A2E',
} as const;

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: PALETTE.ink,
    backgroundColor: '#FFFFFF',
  },
  h1: { fontSize: 22, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  eyebrow: {
    fontSize: 8, color: PALETTE.inkMuted, letterSpacing: 1.5,
    textTransform: 'uppercase', marginBottom: 8,
  },
  rule: { borderBottomWidth: 0.5, borderBottomColor: PALETTE.rule, marginVertical: 12 },
  kv: { flexDirection: 'row', marginBottom: 4 },
  kvK: {
    width: 130, fontSize: 8, color: PALETTE.inkMuted,
    textTransform: 'uppercase', letterSpacing: 1, paddingTop: 1,
  },
  kvV: { flex: 1, fontSize: 10 },
  mono: { fontFamily: 'Courier', fontSize: 9 },
  table: { borderTopWidth: 0.5, borderTopColor: PALETTE.rule, marginTop: 8 },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 0.5, borderBottomColor: PALETTE.rule,
    paddingVertical: 6,
  },
  th: { fontSize: 8, color: PALETTE.inkMuted, textTransform: 'uppercase', letterSpacing: 1 },
  td: { fontSize: 9 },
  cWorker:  { flex: 2 },
  cShift:   { flex: 2 },
  cDate:    { flex: 1.2 },
  cHours:   { flex: 0.8, textAlign: 'right' },
  cReceipt: { flex: 2, textAlign: 'right' },
  footnote: {
    fontSize: 7, color: PALETTE.inkMuted,
    marginTop: 16, lineHeight: 1.4,
  },
  verified: {
    color: PALETTE.verified, fontFamily: 'Helvetica-Bold',
    fontSize: 9, letterSpacing: 1, textTransform: 'uppercase',
  },
});

export interface PackPdfInput {
  manifest: PackManifestInput;
  pack_fingerprint: string;
  /**
   * Public verify URL — embedded on the first page so a reader
   * can go from the PDF to the verifier in one step.
   * Conventionally https://flosmosis.com/verify/pack/{pack_fingerprint}.
   */
  verify_url: string;
  /**
   * Company display name resolved at generation time. Not in the
   * manifest (which holds the UUID); only the PDF surface needs it.
   */
  company_name: string;
  /**
   * Per-shift display rows. Hours rendered to 2dp; the underlying
   * canonical manifest carries integer x100 to avoid float drift.
   */
  display_rows: Array<{
    worker_name: string;
    shift_id_short: string;
    shift_date: string;
    total_hours: number;
    receipt_id: string;
  }>;
}

export function PackPdfDocument({
  manifest, pack_fingerprint, verify_url, company_name, display_rows,
}: PackPdfInput): React.ReactElement {
  return (
    <Document title={`FLOSTRUCTION Evidence Pack — ${manifest.pay_period_start} to ${manifest.pay_period_end}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.eyebrow}>FLOSTRUCTION · VERIFIED LEDGER · WLES v1.0</Text>
        <Text style={styles.h1}>Evidence Pack</Text>
        <Text style={{ fontSize: 11, color: PALETTE.inkMuted, marginBottom: 14 }}>
          {company_name} · {manifest.pay_period_start} to {manifest.pay_period_end}
        </Text>

        <View style={styles.rule} />

        <View style={styles.kv}>
          <Text style={styles.kvK}>Pack fingerprint</Text>
          <Text style={[styles.kvV, styles.mono]}>{pack_fingerprint}</Text>
        </View>
        <View style={styles.kv}>
          <Text style={styles.kvK}>Public verify URL</Text>
          <Text style={[styles.kvV, styles.mono]}>{verify_url}</Text>
        </View>
        <View style={styles.kv}>
          <Text style={styles.kvK}>Shifts</Text>
          <Text style={styles.kvV}>{manifest.shifts.length}</Text>
        </View>
        <View style={styles.kv}>
          <Text style={styles.kvK}>Export target</Text>
          <Text style={styles.kvV}>{manifest.export_target}</Text>
        </View>

        <View style={styles.rule} />

        <Text style={[styles.verified, { marginBottom: 8 }]}>
          PRE-CUTOVER ANCHOR
        </Text>
        <View style={styles.kv}>
          <Text style={styles.kvK}>Anchor</Text>
          <Text style={styles.kvV}>{manifest.frozen_anchor.id}</Text>
        </View>
        <View style={styles.kv}>
          <Text style={styles.kvK}>Fingerprint</Text>
          <Text style={[styles.kvV, styles.mono]}>{manifest.frozen_anchor.fingerprint}</Text>
        </View>
        <View style={styles.kv}>
          <Text style={styles.kvK}>Events</Text>
          <Text style={styles.kvV}>{manifest.frozen_anchor.count}</Text>
        </View>
        <View style={styles.kv}>
          <Text style={styles.kvK}>Bound at</Text>
          <Text style={styles.kvV}>{manifest.frozen_anchor.bound_at}</Text>
        </View>

        <Text style={styles.footnote}>
          The pre-cutover anchor is an MD5 checksum over a frozen,
          ordered set of already-SHA-256 event hashes with
          non-attacker-chosen inputs. Its purpose is to make the
          pre-cutover ledger boundary bit-identifiable across
          attestations; it is NOT a security primitive in its own
          right. The integrity of each event is established by its
          own SHA-256 seal per WLES v1.0 §6, and the chain by §8.
        </Text>

        <View style={styles.rule} />

        <Text style={[styles.verified, { marginBottom: 8 }]}>SHIFTS IN THIS PACK</Text>

        <View style={styles.table}>
          <View style={styles.tr}>
            <Text style={[styles.th, styles.cWorker]}>Worker</Text>
            <Text style={[styles.th, styles.cShift]}>Shift</Text>
            <Text style={[styles.th, styles.cDate]}>Date</Text>
            <Text style={[styles.th, styles.cHours]}>Hours</Text>
            <Text style={[styles.th, styles.cReceipt]}>Receipt</Text>
          </View>
          {display_rows.map((r) => (
            <View key={r.receipt_id} style={styles.tr}>
              <Text style={[styles.td, styles.cWorker]}>{r.worker_name}</Text>
              <Text style={[styles.td, styles.cShift, styles.mono]}>{r.shift_id_short}</Text>
              <Text style={[styles.td, styles.cDate]}>{r.shift_date}</Text>
              <Text style={[styles.td, styles.cHours]}>{r.total_hours.toFixed(2)}</Text>
              <Text style={[styles.td, styles.cReceipt, styles.mono]}>{r.receipt_id}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.footnote}>
          About this pack: each hour above is tied to a worker
          confirmation, a supervisor approval, and a payroll
          approval, all timestamped and SHA-256-sealed at capture per
          WLES v1.0. The pack_fingerprint above is a SHA-256 over
          the pack's canonical JSON (RFC 8785 JCS) — the same input
          will always produce the same fingerprint. A reader can
          recompute it independently via the public verify surface.
        </Text>
      </Page>
    </Document>
  );
}

/**
 * Render the pack PDF and return the bytes. The returned Buffer's
 * SHA-256 is the audit_pack_hash stored on export_packs.
 */
export async function renderPackPdfBuffer(input: PackPdfInput): Promise<Buffer> {
  const stream = await pdf(<PackPdfDocument {...input} />).toBuffer();
  // @react-pdf/renderer returns either a Buffer or a node Readable
  // stream depending on environment; normalise.
  if (Buffer.isBuffer(stream)) return stream;
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
