// Exposure Check — PDF report renderer.
//
// A clean one-page PDF of the indicative result, attached to the user's report
// email. pdfkit, standard fonts only (Helvetica / Courier) — no native deps,
// no headless browser; safe on serverless. Streams to a Buffer.
//
// Indicative language throughout; carries the "not legal advice" line. DRAFT
// scoring is never presented as authoritative.

import PDFDocument from 'pdfkit';
import type { ExposureResult, Band } from './types';
import { orderedGaps } from './report-content';

const INK = '#1F1B14';
const MUTED = '#6E6657';
const LINE = '#DAD6CB';
const NAVY = '#0E1C2F';
const GREEN = '#1E6B3C';
const AMBER = '#8A6116';
const RED = '#B5402F';

const BAND_LABEL: Record<Band, string> = { clear: 'CLEAR', watch: 'WATCH', exposed: 'EXPOSED', na: 'N/A' };
const BAND_COLOUR: Record<Band, string> = { clear: GREEN, watch: AMBER, exposed: RED, na: MUTED };

export async function renderExposureReportPdf(result: ExposureResult): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on('end', () => resolve()));

  const left = 50;
  const right = doc.page.width - 50;
  const width = right - left;

  // Masthead
  doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('FLOSTRUCTION · TIME VERIFICATION', left, 50, {
    characterSpacing: 1,
  });
  doc.font('Helvetica-Bold').fontSize(20).fillColor(INK).text('Labour Hire Exposure Check', left, 70);
  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('Indicative self-assessment — not legal advice', left, 96);

  doc.moveTo(left, 116).lineTo(right, 116).strokeColor(LINE).lineWidth(1).stroke();

  // Summary line
  let y = 132;
  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('Overall', left, y);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(BAND_COLOUR[result.overall]).text(BAND_LABEL[result.overall], left + 70, y - 1);
  const states = result.states.length ? result.states.join(', ') : '—';
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`State(s): ${states}    Worker band: ${result.workerBand ?? '—'}`, left, y + 18);
  y += 44;

  // Where to start — gaps in PRIORITY ORDER. This prioritised cross-gap plan is
  // gated depth (S4): the free on-screen result pairs each gap with one step,
  // the report sequences them.
  const ordered = orderedGaps(result);
  if (ordered.length) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('WHERE TO START', left, y, { characterSpacing: 1 });
    y += 16;
    ordered.forEach((g, i) => {
      if (y > doc.page.height - 160) {
        doc.addPage();
        y = 50;
      }
      doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(`${i + 1}. ${g.label}`, left, y, { width });
      y = doc.y + 1;
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(g.nextStep, left + 14, y, { width: width - 14 });
      y = doc.y + 6;
    });
    y += 8;
  }

  // Per-vector rows
  doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('BY AREA', left, y, { characterSpacing: 1 });
  y += 18;

  for (const v of result.vectors) {
    if (y > doc.page.height - 140) {
      doc.addPage();
      y = 50;
    }
    doc.moveTo(left, y).lineTo(right, y).strokeColor(LINE).lineWidth(0.5).stroke();
    y += 10;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(v.label, left, y, { width: width - 90 });
    doc.font('Courier-Bold').fontSize(9).fillColor(BAND_COLOUR[v.band]).text(BAND_LABEL[v.band], right - 80, y + 1, {
      width: 80,
      align: 'right',
    });
    y += 16;
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(v.blurb, left, y, { width });
    y = doc.y + 4;
    if (v.applicable && v.band !== 'clear') {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor(INK).text(`Next step: ${v.nextStep}`, left + 10, y, { width: width - 10 });
      y = doc.y + 2;
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(`Source: ${v.source.label}`, left + 10, y, { width: width - 10 });
      y = doc.y + 2;
    }
    y += 8;
  }

  // Footer disclaimer
  if (y > doc.page.height - 120) {
    doc.addPage();
    y = 50;
  }
  y = Math.max(y, doc.page.height - 110);
  doc.moveTo(left, y).lineTo(right, y).strokeColor(LINE).lineWidth(1).stroke();
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(MUTED)
    .text(
      'This report provides general information and an indicative self-assessment only. It is not legal, financial or tax advice, ' +
        'and no solicitor–client relationship is formed. Obligations described here are administered by the relevant Australian ' +
        'authorities; confirm current requirements at the source or with a qualified adviser. Flostruction does not calculate wages, ' +
        'award entitlements, tax or superannuation. © 2026 FLOSMOSIS PTY LTD (ACN 697 323 925). Built in Australia.    ' +
        `Ruleset ${result.version}.`,
      left,
      y + 8,
      { width },
    );
  doc.fillColor(NAVY); // reset

  doc.end();
  await done;
  return Buffer.concat(chunks);
}
