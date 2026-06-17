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

function truncHash(h: string): string {
  return h.length > 22 ? h.slice(0, 22) + '…' : h;
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

  // Deterministically clip a cell to one line: pdfkit's lineBreak:false
  // still wraps on spaces in this build, so measure and ellipsize here.
  const fit = (text: string, w: number, font: string, size: number) => {
    doc.font(font).fontSize(size);
    if (doc.widthOfString(text) <= w) return text;
    let t = text;
    while (t.length > 1 && doc.widthOfString(t + '…') > w) t = t.slice(0, -1);
    return t + '…';
  };

  const row = (cols: Col[], y: number, size = 9) => {
    for (const c of cols) {
      const font = c.font ?? 'Helvetica';
      doc
        .font(font)
        .fontSize(size)
        .fillColor(c.color ?? INK)
        .text(fit(c.text, c.w, font, size), c.x, y, {
          width: c.w,
          align: c.align ?? 'left',
          lineBreak: false,
        });
    }
  };

  // ── Masthead ───────────────────────────────────────────────────────
  // The brand hash mark (FMarkBars geometry: three cream bars crossed by
  // three forest diagonals at 18°), drawn into a navy tile so the cream
  // bars read on the white page.
  const drawHashMark = (mx: number, my: number, msize: number) => {
    const s = msize / 96;
    const X = (v: number) => mx + v * s;
    const Y = (v: number) => my + v * s;
    doc.fillColor('#f5f3ee');
    doc.rect(X(6), Y(23), 84 * s, 10 * s).fill();
    doc.rect(X(6), Y(43), 84 * s, 10 * s).fill();
    doc.rect(X(6), Y(63), 84 * s, 10 * s).fill();
    doc.save();
    doc.rotate(18, { origin: [X(48), Y(48)] });
    doc.fillColor('#1e7a40');
    doc.rect(X(30.5), Y(5), 7 * s, 86 * s).fill();
    doc.rect(X(44.5), Y(5), 7 * s, 86 * s).fill();
    doc.rect(X(58.5), Y(5), 7 * s, 86 * s).fill();
    doc.restore();
  };

  doc.roundedRect(left, 46, 36, 36, 5).fill('#0e1c2f');
  drawHashMark(left + 5, 51, 26);
  doc
    .font('Courier')
    .fontSize(7)
    .fillColor(MUTED)
    .text('FLOSTRUCTION', left + 48, 49, { characterSpacing: 1.5 });
  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor(INK)
    .text('Evidence Pack', left + 48, 58);
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(MUTED)
    .text('Every hour flows. Every pay right. — Time verification record', left + 48, 81);

  // QR — the recipient's one-tap re-check, clear of the masthead and banner.
  const qrSize = 76;
  doc.image(qrPng, right - qrSize, 44, { width: qrSize });
  doc
    .font('Helvetica')
    .fontSize(6)
    .fillColor(MUTED)
    .text('Scan to verify', right - qrSize, 44 + qrSize + 2, { width: qrSize, align: 'center' });

  // ── Verdict banner ─────────────────────────────────────────────────
  // Status is carried by a drawn dot + colour + word — no tick glyphs,
  // which the standard PDF fonts (WinAnsi) cannot render. Starts below the
  // QR so the two never overlap.
  let y = 142;
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

  const pageBreak = (need: number) => {
    if (y + need > bottom) {
      doc.addPage();
      y = doc.page.margins.top;
      return true;
    }
    return false;
  };

  // ── Hash chain integrity ───────────────────────────────────────────
  y += 16;
  pageBreak(96);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text('Hash chain integrity', left, y);
  y += 16;
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(MUTED)
    .text(
      'Every shift event is sealed as an immutable WLES (Workforce Ledger Evidentiary Standard) entry — a SHA-256 hash over the event that also references the previous event’s hash, forming a tamper-evident chain. This pack re-computed every hash against the ledger when it was generated.',
      left,
      y,
      { width: contentW, lineGap: 1.5 },
    );
  y = doc.y + 5;
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(accent)
    .text(
      verified
        ? `Chain status: VERIFIED — every event chain is intact across ${pack.total_events} events.`
        : `Chain status: BROKEN — ${pack.broken_chains.length} chain(s) failed verification.`,
      left,
      y,
      { width: contentW },
    );
  y = doc.y + 3;
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(MUTED)
    .text(
      'Flostruction verifies time, not pay. Pay calculations remain the responsibility of the payroll provider.',
      left,
      y,
      { width: contentW },
    );
  y = doc.y + 16;

  // ── WLES event detail ──────────────────────────────────────────────
  const withEvents = pack.shifts.filter((s) => s.events.length > 0);
  if (withEvents.length > 0) {
    pageBreak(44);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text('WLES event detail', left, y);
    y += 18;

    const ec = {
      ts: { x: left, w: 104 },
      type: { x: left + 108, w: 118 },
      hash: { x: left + 228, w: 132 },
      prev: { x: left + 362, w: 133 },
    };
    const eHeader = (yy: number) => {
      row(
        [
          { text: 'TIMESTAMP', x: ec.ts.x, w: ec.ts.w, color: MUTED, font: 'Helvetica-Bold' },
          { text: 'EVENT TYPE', x: ec.type.x, w: ec.type.w, color: MUTED, font: 'Helvetica-Bold' },
          { text: 'HASH', x: ec.hash.x, w: ec.hash.w, color: MUTED, font: 'Helvetica-Bold' },
          {
            text: 'PREVIOUS HASH',
            x: ec.prev.x,
            w: ec.prev.w,
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

    for (const s of withEvents) {
      pageBreak(40);
      doc
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor(INK)
        .text(`${s.worker_name} — ${fmtDate(s.shift_date)} — ${s.events.length} events`, left, y, {
          width: contentW,
          lineBreak: false,
          ellipsis: true,
        });
      y += 15;
      eHeader(y);
      y += 16;
      for (const e of s.events) {
        if (pageBreak(16)) {
          eHeader(y);
          y += 16;
        }
        row(
          [
            { text: fmtDateTime(e.created_at), x: ec.ts.x, w: ec.ts.w },
            { text: e.event_type, x: ec.type.x, w: ec.type.w },
            {
              text: truncHash(e.event_hash),
              x: ec.hash.x,
              w: ec.hash.w,
              color: MUTED,
              font: 'Courier',
            },
            {
              text: e.previous_event_hash ? truncHash(e.previous_event_hash) : '(genesis)',
              x: ec.prev.x,
              w: ec.prev.w,
              color: MUTED,
              font: 'Courier',
            },
          ],
          y,
          7,
        );
        doc
          .moveTo(left, y + 12)
          .lineTo(right, y + 12)
          .strokeColor('#efece4')
          .stroke();
        y += 15;
      }
      y += 8;
    }
  }

  // ── Footer on every page ───────────────────────────────────────────
  // Lift the bottom margin to 0 while writing into the margin band, or
  // pdfkit treats the overflow as content and spawns a phantom page.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const fy = doc.page.height - 34;
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
    doc.page.margins.bottom = savedBottom;
  }

  doc.end();
  await done;
  return Buffer.concat(chunks);
}
