#!/usr/bin/env node
// FLOSTRUCTION /command — visual review harness.
//
// DEV-ONLY companion to visual-harness.mjs. Walks every /command route
// at desktop (1440 wide) AND mobile (390 wide), driving the meaningful
// page states (tabs, expanded audit, form variants, modal open) and
// saving full-page PNGs to scripts/.harness/review/. The screenshots are
// the inputs to the holistic design review.
//
// Run with:
//   FLOS_PREVIEW_LOGIN=1 npm run dev   # in another terminal
//   node scripts/visual-review.mjs

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.HARNESS_BASE_URL ?? 'http://localhost:3000';
const ROOT = join(process.cwd(), 'scripts', '.harness', 'review');

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2 },
];

function dirFor(viewport) {
  const d = join(ROOT, viewport);
  mkdirSync(d, { recursive: true });
  return d;
}

async function shotAt(page, file, viewport) {
  const path = join(dirFor(viewport), file);
  await page.screenshot({ path, fullPage: true });
  console.log(`  shot:  scripts/.harness/review/${viewport}/${file}`);
}

async function goto(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(400);
}

async function tryClick(page, locator, opts = {}) {
  try {
    if (await locator.count() === 0) return false;
    await locator.first().click({ timeout: 3000, ...opts });
    await page.waitForTimeout(250);
    return true;
  } catch { return false; }
}

async function runFor(viewport) {
  console.log(`\n=== viewport: ${viewport.name} (${viewport.width}x${viewport.height}) ===`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    hasTouch: viewport.name === 'mobile',
  });
  const page = await context.newPage();

  // Auth.
  await page.goto(`${BASE}/api/preview-login`, { waitUntil: 'domcontentloaded' });
  if (!page.url().includes('/command')) {
    console.error(`  [${viewport.name}] auth failed; skipping`);
    await browser.close();
    return;
  }

  // ── Overview ───────────────────────────────────────────────────────
  await goto(page, '/command/dashboard');
  await shotAt(page, '01-overview.png', viewport.name);

  // ── Approvals: default ─────────────────────────────────────────────
  await goto(page, '/command/approvals');
  await page.waitForTimeout(600);
  await shotAt(page, '02-approvals-all.png', viewport.name);

  // Tabs — capture each filter view.
  for (const [tabName, file] of [
    ['Needs review', '03-approvals-needs-review.png'],
    ['Ready to export', '04-approvals-ready-to-export.png'],
    ['All', '05-approvals-all-again.png'],
  ]) {
    const tab = page.getByRole('button', { name: new RegExp(`^${tabName}`, 'i') });
    if (await tab.count() > 0) {
      await tab.first().click().catch(() => {});
      await page.waitForTimeout(300);
      await shotAt(page, file, viewport.name);
    } else {
      // Tabs may be rendered as <a> not <button>.
      const tabLink = page.getByRole('tab', { name: new RegExp(tabName, 'i') });
      if (await tabLink.count() > 0) {
        await tabLink.first().click().catch(() => {});
        await page.waitForTimeout(300);
        await shotAt(page, file, viewport.name);
      }
    }
  }

  // Expand the audit trail on the first card if available.
  const auditBtn = page.getByRole('button', { name: /audit trail/i });
  if (await tryClick(page, auditBtn)) {
    await shotAt(page, '06-approvals-audit-expanded.png', viewport.name);
  }

  // Open Adjust hours form.
  const adjustBtn = page.getByRole('button', { name: /^Adjust hours$/i });
  if (await tryClick(page, adjustBtn)) {
    await shotAt(page, '07-approvals-adjust-form.png', viewport.name);
  }

  // Open Flag for review / Query worker form.
  const queryBtn = page.getByRole('button', { name: /^Query worker$/i });
  if (await tryClick(page, queryBtn)) {
    await shotAt(page, '08-approvals-flag-form.png', viewport.name);
  }

  // ── Workers ────────────────────────────────────────────────────────
  await goto(page, '/command/workers');
  await shotAt(page, '10-workers-list.png', viewport.name);

  const addWorker = page.getByRole('button', { name: /^Add worker$/i });
  if (await tryClick(page, addWorker)) {
    await shotAt(page, '11-workers-add-form.png', viewport.name);
    // Trigger validation by submitting empty (blur all required fields).
    const submit = page.getByRole('button', { name: /^Save worker$|^Add worker$|^Create worker$/i }).last();
    if (await submit.count() > 0) {
      await submit.click({ force: true }).catch(() => {});
      await page.waitForTimeout(400);
      await shotAt(page, '12-workers-add-form-validation.png', viewport.name);
    }
  }

  // ── Workers / bulk-upload ──────────────────────────────────────────
  await goto(page, '/command/workers/bulk-upload');
  await shotAt(page, '13-workers-bulk-pick.png', viewport.name);

  // ── Sites ──────────────────────────────────────────────────────────
  await goto(page, '/command/sites');
  await shotAt(page, '20-sites-list.png', viewport.name);

  const addSite = page.getByRole('button', { name: /^Add site$/i });
  if (await tryClick(page, addSite)) {
    await shotAt(page, '21-sites-add-form.png', viewport.name);
  }

  // ── Supervisors ────────────────────────────────────────────────────
  await goto(page, '/command/supervisors');
  await shotAt(page, '30-supervisors-list.png', viewport.name);

  const addSup = page.getByRole('button', { name: /^Add supervisor$/i });
  if (await tryClick(page, addSup)) {
    await shotAt(page, '31-supervisors-add-form.png', viewport.name);
  }

  // ── Evidence ───────────────────────────────────────────────────────
  // Wait specifically for the assemble fetch to complete.
  const evReq = page.waitForResponse(
    (r) => r.url().includes('/api/command/super-evidence'),
    { timeout: 15000 },
  ).catch(() => null);
  await page.goto(`${BASE}/command/evidence`, { waitUntil: 'domcontentloaded' });
  await evReq;
  await page.waitForTimeout(700);
  await shotAt(page, '40-evidence-default.png', viewport.name);

  // Pack with a wider date range — still hits the same endpoint and
  // should redraw the pack-summary + rollup.
  const fromInput = page.locator('#evidence-period-start');
  const toInput = page.locator('#evidence-period-end');
  const assembleBtn = page.getByRole('button', { name: /^Assemble pack$/i });
  if ((await fromInput.count()) && (await toInput.count()) && (await assembleBtn.count())) {
    await fromInput.fill('2026-01-01').catch(() => {});
    await toInput.fill('2026-12-31').catch(() => {});
    const evReq2 = page.waitForResponse(
      (r) => r.url().includes('/api/command/super-evidence'),
      { timeout: 15000 },
    ).catch(() => null);
    await assembleBtn.click().catch(() => {});
    await evReq2;
    await page.waitForTimeout(500);
    await shotAt(page, '41-evidence-wide-period.png', viewport.name);
  }

  // Focus-visible: tab to a primary button and capture the ring.
  await page.goto(`${BASE}/command/workers`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await shotAt(page, '50-focus-visible-workers.png', viewport.name);

  await browser.close();
}

async function main() {
  console.log(`Visual-review target: ${BASE}`);
  console.log(`Output root:          ${ROOT}`);
  for (const v of VIEWPORTS) {
    await runFor(v);
  }
  console.log('\n[visual-review] done.');
}

main().catch((e) => {
  console.error('[visual-review] failed:', e);
  process.exit(1);
});
