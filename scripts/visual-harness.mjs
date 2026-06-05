#!/usr/bin/env node
// FLOSTRUCTION /command — visual harness.
//
// DEV-ONLY. Boots a headless Chromium via Playwright, authenticates
// through /api/preview-login (env-gated; never enabled in production),
// loads /command/approvals, /command/workers, and /command/evidence,
// expands the Flag-for-review inline form, prints the computed
// geometry of the chip pair, action-cluster vs h1 title, and the
// Evidence pack-summary key/value gaps + worker rollup table inset.
// Saves PNGs.
//
// Run with:
//   FLOS_PREVIEW_LOGIN=1 npm run dev   # in another terminal
//   node scripts/visual-harness.mjs
//
// Output:
//   scripts/.harness/approvals.png
//   scripts/.harness/approvals-flag-form.png
//   scripts/.harness/workers.png
//   scripts/.harness/evidence.png
//   stdout: a structured report.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.HARNESS_BASE_URL ?? 'http://localhost:3000';
const OUT_DIR = join(process.cwd(), 'scripts', '.harness');
mkdirSync(OUT_DIR, { recursive: true });

function fmtRect(r) {
  if (!r) return 'null';
  const { x, y, width, height, top, bottom, left, right } = r;
  return JSON.stringify({
    x: round(x), y: round(y),
    width: round(width), height: round(height),
    top: round(top), bottom: round(bottom),
    left: round(left), right: round(right),
  });
}
function round(n) { return Math.round(n * 100) / 100; }

function section(title) {
  console.log('\n\n' + '='.repeat(72));
  console.log(title);
  console.log('='.repeat(72));
}

async function readRect(page, locator) {
  const el = await locator.first().elementHandle();
  if (!el) return null;
  return el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  });
}

async function readComputed(page, locator, props) {
  const el = await locator.first().elementHandle();
  if (!el) return null;
  return el.evaluate((node, propList) => {
    const s = window.getComputedStyle(node);
    const out = {};
    for (const p of propList) out[p] = s.getPropertyValue(p);
    return out;
  }, props);
}

async function main() {
  console.log(`Harness target: ${BASE}`);
  console.log(`Output dir:     ${OUT_DIR}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  // 1. Auth via preview-login. The route 302-redirects to /command/dashboard.
  section('AUTH — /api/preview-login');
  const authResp = await page.goto(`${BASE}/api/preview-login`, { waitUntil: 'domcontentloaded' });
  console.log(`auth final URL:    ${page.url()}`);
  console.log(`auth status:       ${authResp ? authResp.status() : 'no-resp'}`);
  if (!page.url().includes('/command')) {
    console.error('Auth did not land on /command; aborting.');
    await browser.close();
    process.exit(1);
  }

  // 2. /command/approvals — chip pair + action buttons.
  section('PAGE — /command/approvals');
  await page.goto(`${BASE}/command/approvals`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800); // let shift cards paint

  // Every chip carries `data-flos-chip` on its envelope element so we
  // measure the chip itself, never the inner text span.
  const allChips = page.locator('[data-flos-chip]');
  console.log(`flos-chips on page:    ${await allChips.count()}`);

  // The chip PAIR sits inside the shift card header in a flex
  // container that also holds the SealChip; the SealChip's parent's
  // first child is the StatusChip we care about. Walk up from the
  // SealChip to be precise.
  const sealChip = page.locator('button[data-flos-chip][aria-label*="Sealed receipt"]').first();
  const supChip = sealChip.locator('xpath=preceding-sibling::*[@data-flos-chip][1]').first();

  const supRect = await readRect(page, supChip);
  const sealRect = await readRect(page, sealChip);
  const supComputed = await readComputed(page, supChip, [
    'height', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
    'font-size', 'line-height', 'border-radius', 'box-sizing', 'display',
  ]);
  const sealComputed = await readComputed(page, sealChip, [
    'height', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
    'font-size', 'line-height', 'border-radius', 'box-sizing', 'display',
  ]);

  console.log('\n-- Chip pair: StatusChip --');
  console.log(`  rect:     ${fmtRect(supRect)}`);
  console.log(`  computed: ${JSON.stringify(supComputed)}`);
  console.log('\n-- Chip pair: SealChip ("View receipt") --');
  console.log(`  rect:     ${fmtRect(sealRect)}`);
  console.log(`  computed: ${JSON.stringify(sealComputed)}`);
  console.log('\n-- DELTA --');
  if (supRect && sealRect) {
    console.log(`  height delta:  ${round(supRect.height - sealRect.height)} px`);
    console.log(`  top delta:     ${round(supRect.top - sealRect.top)} px`);
    console.log(`  baseline of pair: ${round(Math.min(supRect.top, sealRect.top))} -> ${round(Math.max(supRect.bottom, sealRect.bottom))}`);
  } else {
    console.log('  (one or both chips not found — falling back to first two [data-kind] chips)');
    if (await statusChips.count() >= 2) {
      const a = await readRect(page, statusChips.nth(0));
      const b = await readRect(page, statusChips.nth(1));
      console.log(`  data-kind[0] rect: ${fmtRect(a)}`);
      console.log(`  data-kind[1] rect: ${fmtRect(b)}`);
    }
  }

  // Snapshot
  await page.screenshot({ path: join(OUT_DIR, 'approvals.png'), fullPage: true });
  console.log(`\nscreenshot:        scripts/.harness/approvals.png`);

  // 3. Expand inline forms on the first available shift card so we can
  // measure Adjust & approve, Flag for review, Cancel together.
  section('INLINE-FORM BUTTONS — Final approve / Adjust & approve / Flag for review / Cancel');

  // Open both forms — they sit one above the other so all four buttons
  // are on-screen at the same time.
  const adjustHoursBtn = page.getByRole('button', { name: /^Adjust hours$/i }).first();
  if (await adjustHoursBtn.count() > 0) {
    await adjustHoursBtn.click();
    await page.waitForTimeout(150);
  }
  const queryBtn = page.getByRole('button', { name: /^Query worker$/i }).first();
  if (await queryBtn.count() > 0) {
    await queryBtn.click();
    await page.waitForTimeout(150);
  }

  const approveBtn = page.getByRole('button', { name: /^Final approve$/i }).first();
  const adjustApproveBtn = page.getByRole('button', { name: /Adjust .* approve/i }).first();
  const flagBtn = page.getByRole('button', { name: /^Flag for review$/i }).first();
  const cancelBtns = page.getByRole('button', { name: /^Cancel$/i });

  const approveRect = (await approveBtn.count()) ? await readRect(page, approveBtn) : null;
  const adjustRect  = (await adjustApproveBtn.count()) ? await readRect(page, adjustApproveBtn) : null;
  const flagRect    = (await flagBtn.count()) ? await readRect(page, flagBtn) : null;
  const cancelRect  = (await cancelBtns.count()) ? await readRect(page, cancelBtns.first()) : null;
  const cancelDispRect = (await cancelBtns.count() > 1) ? await readRect(page, cancelBtns.last()) : null;

  const computedProps = ['height', 'border-radius', 'padding-left', 'padding-right', 'padding-top', 'padding-bottom', 'background-color', 'color', 'font-size', 'border-color', 'min-height', 'box-sizing'];
  const approveC = approveRect ? await readComputed(page, approveBtn, computedProps) : null;
  const adjustC  = adjustRect  ? await readComputed(page, adjustApproveBtn, computedProps) : null;
  const flagC    = flagRect    ? await readComputed(page, flagBtn, computedProps) : null;
  const cancelC  = cancelRect  ? await readComputed(page, cancelBtns.first(), computedProps) : null;

  console.log(`\n-- Final approve --\n  rect:     ${fmtRect(approveRect)}\n  computed: ${JSON.stringify(approveC)}`);
  console.log(`\n-- Adjust & approve --\n  rect:     ${fmtRect(adjustRect)}\n  computed: ${JSON.stringify(adjustC)}`);
  console.log(`\n-- Flag for review --\n  rect:     ${fmtRect(flagRect)}\n  computed: ${JSON.stringify(flagC)}`);
  console.log(`\n-- Cancel (first) --\n  rect:     ${fmtRect(cancelRect)}\n  computed: ${JSON.stringify(cancelC)}`);
  if (cancelDispRect) console.log(`\n-- Cancel (dispute form) --\n  rect:     ${fmtRect(cancelDispRect)}`);

  console.log('\n-- DELTAS --');
  if (flagRect && adjustRect)  console.log(`  flag height − adjust&approve: ${round(flagRect.height - adjustRect.height)} px`);
  if (flagRect && cancelRect)  console.log(`  flag height − cancel:         ${round(flagRect.height - cancelRect.height)} px`);
  if (adjustRect && approveRect) console.log(`  adjust − final approve:       ${round(adjustRect.height - approveRect.height)} px`);

  await page.screenshot({ path: join(OUT_DIR, 'approvals-flag-form.png'), fullPage: true });
  console.log(`\nscreenshot:        scripts/.harness/approvals-flag-form.png`);

  // 4. /command/workers — header h1 vs action cluster centring.
  section('PAGE — /command/workers (header centring)');
  await page.goto(`${BASE}/command/workers`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  // PageHeader is the <header> that CONTAINS the <h1>. There's also a
  // Masthead <header> at the top of the page that doesn't contain an
  // h1 — `header:has(h1)` disambiguates. With the v2 PageHeader the
  // title-row is the flex container that sits on the row with the h1
  // (so actions can centre on the h1, not on the title BLOCK).
  const headerEl = page.locator('header:has(h1)').first();
  const titleRow = headerEl.locator('div:has(> h1)').first();
  const h1 = titleRow.locator('> h1').first();
  const actionsCluster = titleRow.locator('> div').last();

  const h1Rect = await readRect(page, h1);
  const actionsRect = await readRect(page, actionsCluster);
  const headerRect = await readRect(page, headerEl);
  const h1Computed = await readComputed(page, h1, ['font-size', 'line-height', 'height']);

  // Probe both direct children of the header — title block and actions
  // wrapper — and the parent header.
  const titleBlock = headerEl.locator('> div').first();
  const tbRect = await readRect(page, titleBlock);
  const tbComputed = await readComputed(page, titleBlock, ['height', 'margin-top', 'padding-top', 'padding-bottom']);
  console.log(`\n-- title block (left flex item) --\n  rect:     ${fmtRect(tbRect)}\n  computed: ${JSON.stringify(tbComputed)}`);

  const actionsComputed = await readComputed(page, actionsCluster, ['height', 'align-self', 'margin-top']);
  console.log(`-- actions cluster computed: ${JSON.stringify(actionsComputed)}`);

  const headerComputed = await readComputed(page, headerEl, ['display', 'align-items', 'flex-direction', 'height']);
  console.log(`-- header (outer) computed: ${JSON.stringify(headerComputed)}`);

  // Probe every descendant inside the actions cluster.
  const actionDescendants = actionsCluster.locator('* button, * a');
  const descCount = await actionDescendants.count();
  console.log(`-- actions descendants (button/a): ${descCount} --`);
  for (let i = 0; i < descCount; i++) {
    const c = actionDescendants.nth(i);
    const r = await readRect(page, c);
    const tag = await c.evaluate((n) => n.tagName);
    const text = await c.evaluate((n) => (n.textContent || '').trim().slice(0, 40));
    const cs = await readComputed(page, c, ['height', 'min-height']);
    console.log(`  [${i}] <${tag}> "${text}": rect=${fmtRect(r)} computed=${JSON.stringify(cs)}`);
  }

  console.log('-- h1 --');
  console.log(`  rect:     ${fmtRect(h1Rect)}`);
  console.log(`  computed: ${JSON.stringify(h1Computed)}`);
  console.log('-- actions cluster --');
  console.log(`  rect:     ${fmtRect(actionsRect)}`);
  console.log('-- header (outer) --');
  console.log(`  rect:     ${fmtRect(headerRect)}`);
  if (h1Rect && actionsRect) {
    const h1Centre = h1Rect.top + h1Rect.height / 2;
    const actCentre = actionsRect.top + actionsRect.height / 2;
    console.log(`\n  h1 box centre:        ${round(h1Centre)} px`);
    console.log(`  actions box centre:   ${round(actCentre)} px`);
    console.log(`  delta (act − h1):     ${round(actCentre - h1Centre)} px`);
    // Approximate cap-height of Fraunces at the rendered px size — opt
    // sizing ~0.7 of font-size for serifs. Useful sanity figure.
    const fontPx = parseFloat(h1Computed?.['font-size'] ?? '0');
    const lhPx = parseFloat(h1Computed?.['line-height'] ?? '0') || h1Rect.height;
    const capCentre = h1Rect.top + (lhPx - fontPx * 0.7) / 2 + (fontPx * 0.7) / 2;
    console.log(`  approx cap-height centre: ${round(capCentre)} px`);
    console.log(`  delta (act − cap centre): ${round(actCentre - capCentre)} px`);
  }

  await page.screenshot({ path: join(OUT_DIR, 'workers.png'), fullPage: true });
  console.log(`\nscreenshot:        scripts/.harness/workers.png`);

  // 5. /command/evidence — pack-summary dl row gaps + worker rollup
  //    table inset + four-side padding parity on both cards.
  section('PAGE — /command/evidence (pack-summary gaps + rollup inset)');
  // Race the navigation against the auto-fetch the page kicks off on
  // mount. We need both: the route to render AND /api/command/super-
  // evidence to come back before the primary Card is in the DOM.
  const evidenceFetch = page.waitForResponse(
    (r) => r.url().includes('/api/command/super-evidence'),
    { timeout: 20000 },
  ).catch(() => null);
  await page.goto(`${BASE}/command/evidence`, { waitUntil: 'domcontentloaded' });
  await evidenceFetch;
  // The Card renders inside a useEffect after the fetch resolves; wait
  // for the data-emphasis="primary" section to appear (or time out and
  // print what is on the page so we can see the failure mode).
  // The Card React component doesn't forward arbitrary DOM attrs, so
  // `data-emphasis="primary"` on <Card> isn't on the rendered section.
  // The pack-summary card is uniquely identifiable as the <section> that
  // contains the <dl> with the key/value summary.
  try {
    await page.waitForSelector('section:has(dl)', { timeout: 10000 });
  } catch {
    const bodyText = await page.locator('main').first().textContent().catch(() => '');
    console.log('(primary card did not render — main text follows)');
    console.log((bodyText || '').slice(0, 400));
  }
  await page.waitForTimeout(300);

  // The pack-summary Card is the first Card with data-emphasis="primary".
  // It contains the <dl> we need to measure.
  const summaryCard = page.locator('section:has(dl)').first();
  const summaryRect = await readRect(page, summaryCard);
  const summaryComputed = await readComputed(page, summaryCard, [
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'border-top-width', 'border-left-width',
  ]);
  console.log('\n-- Pack-summary Card --');
  console.log(`  rect:     ${fmtRect(summaryRect)}`);
  console.log(`  computed: ${JSON.stringify(summaryComputed)}`);

  // Pull every dt+dd pair inside the dl and measure both the CELL rect
  // (label/value column boundaries) and the TEXT rect (Range over the
  // text node — captures the actual glyph extents) so we can report
  // BOTH the cell-boundary gap and the visual text-to-text gap.
  const dl = summaryCard.locator('dl').first();
  const dlExists = (await dl.count()) > 0;
  console.log(`  dl present: ${dlExists}`);

  let summaryContentLeftX = null;
  if (dlExists) {
    // dl computed style — confirm grid columns are what the page sets.
    const dlComputed = await readComputed(page, dl, [
      'display', 'grid-template-columns', 'column-gap', 'row-gap',
    ]);
    console.log(`  dl computed: ${JSON.stringify(dlComputed)}`);

    const rows = await dl.evaluate((node) => {
      function textRect(el) {
        if (!el || !el.firstChild) return null;
        const r = document.createRange();
        r.selectNodeContents(el);
        const rect = r.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
      }
      function cellRect(el) {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      }
      const dts = Array.from(node.querySelectorAll(':scope > dt'));
      const dds = Array.from(node.querySelectorAll(':scope > dd'));
      const n = Math.min(dts.length, dds.length);
      const out = [];
      for (let i = 0; i < n; i++) {
        const dtEl = dts[i];
        const ddEl = dds[i];
        out.push({
          label: (dtEl.textContent || '').trim(),
          value: (ddEl.textContent || '').trim().slice(0, 60),
          dtCell: cellRect(dtEl),
          ddCell: cellRect(ddEl),
          dtText: textRect(dtEl),
          ddText: textRect(ddEl),
          dtComputed: (() => { const s = getComputedStyle(dtEl); return { textAlign: s.textAlign, fontSize: s.fontSize }; })(),
          ddComputed: (() => { const s = getComputedStyle(ddEl); return { textAlign: s.textAlign, fontSize: s.fontSize }; })(),
        });
      }
      return out;
    });

    console.log(`\n-- pack-summary dl rows: ${rows.length} --`);
    let minCellGap = Infinity, maxCellGap = -Infinity;
    let minTextGap = Infinity, maxTextGap = -Infinity;
    for (const r of rows) {
      const cellGap = round(r.ddCell.left - r.dtCell.right);
      const textGap = r.dtText && r.ddText ? round(r.ddText.left - r.dtText.right) : null;
      if (cellGap < minCellGap) minCellGap = cellGap;
      if (cellGap > maxCellGap) maxCellGap = cellGap;
      if (textGap !== null) {
        if (textGap < minTextGap) minTextGap = textGap;
        if (textGap > maxTextGap) maxTextGap = textGap;
      }
      console.log(
        `  [${(r.label).padEnd(20)}] dtCell ${round(r.dtCell.left)}-${round(r.dtCell.right)} (w ${round(r.dtCell.width)}) ` +
        `| dtText ${r.dtText ? round(r.dtText.right) : '-'} | ddText ${r.ddText ? round(r.ddText.left) : '-'} ` +
        `| cellGap ${cellGap}px | textGap ${textGap}px | dt align ${r.dtComputed.textAlign}`,
      );
    }
    console.log(`\n  cell-gap range: ${minCellGap}..${maxCellGap}  (spread ${round(maxCellGap - minCellGap)} px)`);
    console.log(`  text-gap range: ${minTextGap}..${maxTextGap}  (spread ${round(maxTextGap - minTextGap)} px)`);
    if (rows.length > 0) {
      summaryContentLeftX = round(rows[0].dtCell.left);
      console.log(`\n  summary content left x (dt[0].left): ${summaryContentLeftX} px`);
    }
  }

  // Worker rollup card — locate the section that contains the table
  // (it has an h3 with "Worker rollup" or the table itself is the
  // only one on this page).
  section('PAGE — /command/evidence (worker rollup)');
  const rollupCard = page.locator('section', { has: page.getByRole('table') }).first();
  const rollupRect = await readRect(page, rollupCard);
  const rollupComputed = await readComputed(page, rollupCard, [
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'border-top-width', 'border-left-width',
  ]);
  console.log(`\n-- Worker rollup Card --`);
  console.log(`  rect:     ${fmtRect(rollupRect)}`);
  console.log(`  computed: ${JSON.stringify(rollupComputed)}`);

  // CardHeader (h3) inside the rollup.
  const rollupHeader = rollupCard.locator('h3').first();
  if (await rollupHeader.count() > 0) {
    const hRect = await readRect(page, rollupHeader);
    const hParent = rollupHeader.locator('xpath=..').first();
    const hParentRect = await readRect(page, hParent);
    console.log(`-- rollup h3 ("Worker rollup") rect: ${fmtRect(hRect)}`);
    console.log(`-- rollup h3 parent rect:            ${fmtRect(hParentRect)}`);
  }

  // First column header + first body cell — left edges.
  const firstTh = rollupCard.locator('thead th').first();
  const firstThRect = await readRect(page, firstTh);
  const firstThComputed = await readComputed(page, firstTh, [
    'padding-left', 'padding-right', 'padding-top', 'padding-bottom',
    'text-align',
  ]);
  console.log(`-- first <th> rect: ${fmtRect(firstThRect)}`);
  console.log(`   computed:        ${JSON.stringify(firstThComputed)}`);

  // First body cell — present only if rows exist; otherwise the empty
  // state row spans every column.
  const firstTd = rollupCard.locator('tbody td').first();
  if (await firstTd.count() > 0) {
    const tdRect = await readRect(page, firstTd);
    const tdComputed = await readComputed(page, firstTd, [
      'padding-left', 'padding-right', 'padding-top', 'padding-bottom',
      'text-align', 'vertical-align',
    ]);
    const tdTextEdge = await firstTd.evaluate((node) => {
      const text = node.firstChild?.firstChild ?? node.firstChild ?? null;
      if (!text) return null;
      const r = document.createRange();
      r.selectNodeContents(text);
      const rect = r.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    });
    console.log(`-- first <td> rect: ${fmtRect(tdRect)}`);
    console.log(`   computed:        ${JSON.stringify(tdComputed)}`);
    console.log(`   first-cell text edge: ${tdTextEdge ? JSON.stringify({ left: round(tdTextEdge.left), top: round(tdTextEdge.top) }) : 'null'}`);

  }
  // Authoritative "table content left x" is the first <th>'s left edge,
  // since rows may be empty (the colspan empty-state cell would
  // otherwise be centred and yield a misleading text-left).
  if (summaryContentLeftX !== null && firstThRect) {
    const tableContentLeftX = round(firstThRect.left);
    console.log(`\n  summary content left x (dt[0] cell.left): ${summaryContentLeftX}`);
    console.log(`  table   content left x (first th.left):   ${tableContentLeftX}`);
    console.log(`  delta (table − summary):                  ${round(tableContentLeftX - summaryContentLeftX)} px`);
  }

  // Numeric column headers — right-align check + tabular-nums.
  const numericHeaderHits = rollupCard.locator('thead th', { hasText: /Shifts|Verified hours/i });
  const nhCount = await numericHeaderHits.count();
  console.log(`-- numeric header columns found: ${nhCount}`);
  for (let i = 0; i < nhCount; i++) {
    const el = numericHeaderHits.nth(i);
    const txt = (await el.textContent() || '').trim();
    const cs = await readComputed(page, el, ['text-align', 'font-variant-numeric']);
    console.log(`   [${txt}] computed: ${JSON.stringify(cs)}`);
  }

  // Empty-state detection — if the rollup table renders an empty row,
  // measure its vertical position vs the table body so we can confirm
  // it's centred.
  const emptyTd = rollupCard.locator('tbody td[colspan]');
  if (await emptyTd.count() > 0) {
    const eRect = await readRect(page, emptyTd.first());
    const tbody = rollupCard.locator('tbody').first();
    const tbodyRect = await readRect(page, tbody);
    const eComputed = await readComputed(page, emptyTd.first(), [
      'padding-top', 'padding-bottom', 'vertical-align', 'text-align',
    ]);
    console.log(`-- empty-state <td colspan>: ${fmtRect(eRect)}`);
    console.log(`   computed:                  ${JSON.stringify(eComputed)}`);
    console.log(`   tbody rect:                ${fmtRect(tbodyRect)}`);
    if (eRect && tbodyRect) {
      const empCentre = eRect.top + eRect.height / 2;
      const bodyCentre = tbodyRect.top + tbodyRect.height / 2;
      console.log(`   empty centre y: ${round(empCentre)}  | body centre y: ${round(bodyCentre)}  | delta: ${round(empCentre - bodyCentre)} px`);
    }
  } else {
    console.log(`-- empty-state row: not present (rows have data)`);
  }

  // Four-side padding parity check between the two cards.
  if (summaryComputed && rollupComputed) {
    console.log('\n-- four-side padding parity (summary vs rollup) --');
    const sides = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'];
    for (const s of sides) {
      const a = summaryComputed[s];
      const b = rollupComputed[s];
      const eq = a === b ? 'EQUAL' : 'DIFFER';
      console.log(`   ${s.padEnd(18)} summary ${a.padStart(8)} | rollup ${b.padStart(8)}  [${eq}]`);
    }
  }

  await page.screenshot({ path: join(OUT_DIR, 'evidence.png'), fullPage: true });
  console.log(`\nscreenshot:        scripts/.harness/evidence.png`);

  await browser.close();
  console.log('\n[harness] done.');
}

main().catch((e) => {
  console.error('[harness] failed:', e);
  process.exit(1);
});
