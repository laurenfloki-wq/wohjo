// Evidence Pack — PDF renderer.
//
// The official, hand-off-able deliverable: a PDF (not raw HTML) that
// reads as a finished document, survives corporate mail filters, and
// archives. It carries a QR + verify URL so the recipient can re-check
// the hours against the live ledger rather than trusting the file.
//
// pdfkit, standard fonts only (Helvetica / Courier) — no native deps,
// no headless browser; safe on serverless. Streams to a Buffer.

import PDFDocument from 'pdfkit';
import type { AuditPack } from './types';
import type { VerifyExportMeta } from './verify-pack';

const INK = '#16201b';
const MUTED = '#5a635c';
const LINE = '#dad6cb';
const OK = '#1b6e3c';
const BAD = '#b42318';

function fmtDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Australia/Sydney',
  });
}

function fmtDateTime(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Australia/Sydney',
  });
}

interface Col {
  text: string;
  x: number;
  w: number;
  align?: 'left' | 'right' | 'center';
  color?: string;
  font?: string;
}

export async function renderAuditPdf(opts: {
  meta: VerifyExportMeta;
  pack: AuditPack;
  url: string;
  qrPng: Buffer;
}): Promise<Buffer> {
  const { meta, pack, url, qrPng } = opts;
  const verified = pack.hash_chain_integrity === 'VERIFIED';
  const accent = verified ? OK : BAD;

  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on('end', () => resolve()));

  const left = doc.page.margins.left; // 50
  const right = doc.page.width - doc.page.margins.right; // 545.28
  const contentW = right - left;
  const bottom = doc.page.height - doc.page.margins.bottom;

  const row = (cols: Col[], y: number, size = 9) => {
    for (const c of cols) {
      doc
        .font(c.font ?? 'Helvetica')
        .fontSize(size)
        .fillColor(c.color ?? INK)
        .text(c.text, c.x, y, {
          width: c.w,
          align: c.align ?? 'left',
          lineBreak: false,
          ellipsis: true,
        });
    }
  };

  // ── Masthead ───────────────────────────────────────────────────────
  doc.rect(left, 50, 78, 18).fill(INK);
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor('#ffffff')
    .text('FLOSTRUCTION', left + 8, 55);
  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor(INK)
    .text('Audit Pack', left + 90, 50);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(MUTED)
    .text('Every hour flows. Every pay right. — Time verification record', left + 90, 72);

  // QR + verify URL, top-right.
  const qrSize = 78;
  doc.image(qrPng, right - qrSize, 46, { width: qrSize });
  doc
    .font('Helvetica')
    .fontSize(6)
    .fillColor(MUTED)
    .text('Scan to verify', right - qrSize, 46 + qrSize + 2, { width: qrSize, align: 'center' });

  // ── Verdict banner ─────────────────────────────────────────────────
  // Status is carried by a drawn dot + colour + word — no tick glyphs,
  // which the standard PDF fonts (WinAnsi) cannot render.
  let y = 110;
  doc.roundedRect(left, y, contentW, 46, 8).fill(verified ? '#eaf3ec' : '#fbeceb');
  doc.circle(left + 24, y + 19, 7).fill(accent);
  doc
    .font('Helvetica-Bold')
    .fontSize(20)
    .fillColor(accent)
    .text(verified ? 'VERIFIED' : 'BROKEN', left + 38, y + 8);
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(MUTED)
    .text(
      verified
        ? 'Hash chain re-checked against the WLES ledger — no tampering detected.'
        : `${pack.broken_chains.length} shift chain(s) failed verification — review before paying.`,
      left + 38,
      y + 31,
      { width: contentW - 54 },
    );

  // ── Summary stats ──────────────────────────────────────────────────
  y += 62;
  const stats: Array<[string, string]> = [
    ['Pay period', `${meta.payPeriodStart} — ${meta.payPeriodEnd}`],
    ['Verified hours', pack.total_hours.toFixed(2)],
    ['Shifts', String(pack.total_shifts)],
    ['WLES events', String(pack.total_events)],
  ];
  const sw = contentW / stats.length;
  stats.forEach(([label, value], i) => {
    const sx = left + i * sw;
    doc
      .roundedRect(sx + (i ? 4 : 0), y, sw - (i ? 4 : 0) - (i < stats.length - 1 ? 4 : 0), 44, 6)
      .stroke(LINE);
    doc
      .font('Helvetica')
      .fontSize(6.5)
      .fillColor(MUTED)
      .text(label.toUpperCase(), sx + 10, y + 9, { width: sw - 20 });
    doc
      .font('Helvetica-Bold')
      .fontSize(value.length > 14 ? 9 : 14)
      .fillColor(INK)
      .text(value, sx + 10, y + 21, { width: sw - 20, lineBreak: false, ellipsis: true });
  });

  // ── Shift summary table ────────────────────────────────────────────
  y += 70;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text('Shift summary', left, y);
  y += 20;

  const cols = {
    worker: { x: left, w: 120 },
    site: { x: left + 122, w: 95 },
    date: { x: left + 219, w: 70 },
    hours: { x: left + 291, w: 45 },
    receipt: { x: left + 340, w: 120 },
    chain: { x: left + 462, w: 33 },
  };
  const header = (yy: number) => {
    row(
      [
        {
          text: 'WORKER',
          x: cols.worker.x,
          w: cols.worker.w,
          color: MUTED,
          font: 'Helvetica-Bold',
        },
        { text: 'SITE', x: cols.site.x, w: cols.site.w, color: MUTED, font: 'Helvetica-Bold' },
        { text: 'DATE', x: cols.date.x, w: cols.date.w, color: MUTED, font: 'Helvetica-Bold' },
        {
          text: 'HOURS',
          x: cols.hours.x,
          w: cols.hours.w,
          align: 'right',
          color: MUTED,
          font: 'Helvetica-Bold',
        },
        {
          text: 'RECEIPT',
          x: cols.receipt.x,
          w: cols.receipt.w,
          color: MUTED,
          font: 'Helvetica-Bold',
        },
        {
          text: 'CHAIN',
          x: cols.chain.x,
          w: cols.chain.w,
          align: 'center',
          color: MUTED,
          font: 'Helvetica-Bold',
        },
      ],
      yy,
      6.5,
    );
    doc
      .moveTo(left, yy + 12)
      .lineTo(right, yy + 12)
      .strokeColor(LINE)
      .stroke();
  };
  header(y);
  y += 18;

  for (const s of pack.shifts) {
    if (y + 16 > bottom) {
      doc.addPage();
      y = doc.page.margins.top;
      header(y);
      y += 18;
    }
    row(
      [
        { text: s.worker_name, x: cols.worker.x, w: cols.worker.w },
        { text: s.site_name, x: cols.site.x, w: cols.site.w },
        { text: fmtDate(s.shift_date), x: cols.date.x, w: cols.date.w },
        { text: s.total_hours.toFixed(2), x: cols.hours.x, w: cols.hours.w, align: 'right' },
        { text: s.receipt_id, x: cols.receipt.x, w: cols.receipt.w, font: 'Courier' },
      ],
      y,
      9,
    );
    // Chain status as a colour dot (font-independent).
    doc.circle(cols.chain.x + cols.chain.w / 2, y + 4, 3.5).fill(s.hash_chain_valid ? OK : BAD);
    doc
      .moveTo(left, y + 13)
      .lineTo(right, y + 13)
      .strokeColor('#efece4')
      .stroke();
    y += 17;
  }

  // ── Footer on every page ───────────────────────────────────────────
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const fy = doc.page.height - doc.page.margins.bottom + 14;
    doc.font('Helvetica').fontSize(6.5).fillColor(MUTED);
    doc.text(`Verify live: ${url}`, left, fy, {
      width: contentW,
      lineBreak: false,
      ellipsis: true,
    });
    doc.text(
      `Generated ${fmtDateTime(pack.generated_at)} · File SHA-256 ${meta.fileHash} · Page ${i - range.start + 1} of ${range.count}`,
      left,
      fy + 9,
      { width: contentW, lineBreak: false, ellipsis: true },
    );
  }

  doc.end();
  await done;
  return Buffer.concat(chunks);
}
