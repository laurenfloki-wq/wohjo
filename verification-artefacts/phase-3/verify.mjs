// Verification harness for Phase 3 (CSS 3D seal + SVG hash chain).
// Real headless Chromium against the production build on :3939.
//
// SVG-only reality: the WebGL R3F path was unreachable due to a
// Next 16.2.3 Turbopack + React 19.2.4 + R3F 9.6.1 incompatibility
// surfaced during integration. SVG fallback (originally specified
// for mobile / reduced-motion / WebGL-unavailable / context-loss
// recovery) ships as the sole render path; brief §1 mobile-tier
// substitution authorisation, brief Stop-and-Report condition #1.
//
// What this harness still proves:
//   1a. HashChainScene section renders on /.
//   1b. (formerly canvas) — replaced: SVG renders, six blocks visible.
//   1c. No Three.js chunk loads anywhere (deps uninstalled).
//   1d. No console errors on /.
//   2a. Reduced-motion still uses SVG (the only path).
//   2c. Tamper still works under reduced-motion.
//   2d. Reduced-motion: broken glyphs render statically.
//   3.  Non-marketing routes: HashChainScene chunk is NOT shipped.
//   4.  (WebGL canvas) — N/A.
//   5a. Tamper-3 cascade is directionally correct (block 3 alters,
//       blocks 4..6 turn broken, blocks 1..2 unchanged).
//   5b. aria-live announcement fires on tamper.
//   5c. Cascade deterministic across cycles.
//   5d. Cascade correct for every tamper position 1..6.
//   6a. Reset restores initial state.
//   6b. aria-live announcement on reset.
//   7a. Tamper buttons are keyboard-focusable.
//   8a/b. ScrollTrigger engine count bounded on /; reported on
//         non-marketing routes.
//   Phase3a-1..3. Seal element + parent perspective + reduced-
//                  motion static baseline.

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;
const BASE_URL = 'http://localhost:3939';

const results = {
  startedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  checks: [],
};

function record(name, status, detail = {}) {
  const entry = { name, status, ...detail };
  results.checks.push(entry);
  const symbol = status === 'pass' ? '✓' : status === 'fail' ? '✗' : '·';
  console.log(`${symbol} ${name}${detail.note ? ' — ' + detail.note : ''}`);
}

function watchRequests(page) {
  const urls = [];
  page.on('request', (r) => urls.push(r.url()));
  return urls;
}

async function visitWithCapture(context, path, label, opts = {}) {
  const page = await context.newPage();
  if (opts.reducedMotion) {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  }
  const urls = watchRequests(page);
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    // Filter env-specific noise that isn't from our code:
    //   - Unsplash hero photos blocked by report-only CSP (pre-
    //     existing on this page; intentional per founder direction)
    //   - TLS chain failures hitting Unsplash from the sandbox.
    if (/ERR_CERT_AUTHORITY_INVALID|images\.unsplash\.com/.test(text)) return;
    consoleErrors.push(text);
  });
  await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle' });
  return { page, urls, consoleErrors, label };
}

function hasThreeChunk(urls) {
  // After uninstalling three/@react-three/* this must return false
  // everywhere. We pattern-match Three.js-typical content in any
  // chunk URL the page fetched.
  return urls.some((u) => /threejs|three\.module|@react-three|troika/i.test(u));
}

async function pageContainsThreeBytes(page) {
  // Last-resort: actually fetch every loaded chunk and search for
  // a Three.js fingerprint. Catches the case where a chunk got
  // renamed but still bundled Three.
  const chunkUrls = await page.evaluate(() =>
    Array.from(document.querySelectorAll('script[src]')).map((s) => s.getAttribute('src') ?? ''),
  );
  for (const u of chunkUrls) {
    if (!u.includes('/_next/static/chunks/')) continue;
    try {
      const res = await fetch(BASE_URL + u);
      const text = await res.text();
      if (/BufferGeometry|MeshStandardMaterial|@react-three/.test(text)) {
        return u;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

async function runChecks() {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
    });

    // ─── 1, 5, 6, 7: marketing route, no reduced-motion ───
    {
      const { page, urls, consoleErrors } = await visitWithCapture(ctx, '/', '/-default');
      await page.evaluate(() => {
        const el = document.getElementById('hash-chain-demo');
        if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
      });
      await page.waitForTimeout(1200);
      await page.waitForFunction(() => !!document.querySelector('#hash-chain-demo'), {
        timeout: 5000,
      });

      const sectionExists = await page.locator('#hash-chain-demo').count();
      record('1a. HashChainScene section renders on /', sectionExists > 0 ? 'pass' : 'fail');

      const svgRects = await page.locator('#hash-chain-demo svg rect[rx="4"]').count();
      record('1b. SVG chain renders 6 block rects', svgRects === 6 ? 'pass' : 'fail', {
        note: `${svgRects} rects`,
      });

      const threeLoaded = hasThreeChunk(urls);
      record(
        '1c. No Three.js / @react-three chunk URLs requested on /',
        !threeLoaded ? 'pass' : 'fail',
      );

      const threeBytesUrl = await pageContainsThreeBytes(page);
      record(
        '1c-deep. No chunk on / contains Three.js bytes',
        threeBytesUrl === null ? 'pass' : 'fail',
        { note: threeBytesUrl ? `Three bytes in ${threeBytesUrl}` : 'clean' },
      );

      await page.screenshot({
        path: resolve(OUT_DIR, 'screenshot-01-chain-initial.png'),
        clip: await page.locator('#hash-chain-demo').boundingBox(),
      });

      const readHashes = () =>
        page.$$eval('button[data-hash]', (els) =>
          els
            .slice()
            .sort((a, b) => Number(a.dataset.blockIndex) - Number(b.dataset.blockIndex))
            .map((e) => e.dataset.hash ?? ''),
        );

      const hashesBefore = await readHashes();
      const liveRegionLocator = page.locator('#hash-chain-demo [role="status"]');

      // Keyboard-only path to tamper-3.
      const tamper3 = page.locator('button[aria-label^="Tamper with block 3"]');
      await tamper3.focus();
      const isFocused = await tamper3.evaluate((el) => el === document.activeElement);
      record('7a. Tamper-3 button is keyboard-focusable', isFocused ? 'pass' : 'fail');

      await tamper3.press('Enter');
      await page.waitForTimeout(300);

      const hashesAfter = await readHashes();
      const cascadeCorrect =
        hashesBefore[0] === hashesAfter[0] &&
        hashesBefore[1] === hashesAfter[1] &&
        hashesBefore[2] !== hashesAfter[2] &&
        hashesBefore[3] !== hashesAfter[3] &&
        hashesBefore[4] !== hashesAfter[4] &&
        hashesBefore[5] !== hashesAfter[5];
      record('5a. Tamper-3 cascade is directionally correct', cascadeCorrect ? 'pass' : 'fail', {
        note: `before=[${hashesBefore.join(',')}] after=[${hashesAfter.join(',')}]`,
      });

      const announcement = (await liveRegionLocator.textContent())?.trim() ?? '';
      const announcementOk =
        /Block 3 altered/i.test(announcement) &&
        /Blocks 4 through 6 are now invalid/i.test(announcement);
      record('5b. aria-live announcement on tamper', announcementOk ? 'pass' : 'fail', {
        note: announcement || '(empty)',
      });

      await page.screenshot({
        path: resolve(OUT_DIR, 'screenshot-02-chain-tampered-block-3.png'),
        clip: await page.locator('#hash-chain-demo').boundingBox(),
      });

      // Reset
      await page.locator('button:has-text("Reset chain")').click();
      await page.waitForTimeout(300);
      const hashesAfterReset = await readHashes();
      const resetOk = hashesAfterReset.every((h, i) => h === hashesBefore[i]);
      record('6a. Reset restores initial chain hashes', resetOk ? 'pass' : 'fail', {
        note: `reset=[${hashesAfterReset.join(',')}]`,
      });

      const announcementReset = (await liveRegionLocator.textContent())?.trim() ?? '';
      record(
        '6b. aria-live announcement on reset',
        /reset|verified/i.test(announcementReset) ? 'pass' : 'fail',
        { note: announcementReset || '(empty)' },
      );

      await page.screenshot({
        path: resolve(OUT_DIR, 'screenshot-03-chain-after-reset.png'),
        clip: await page.locator('#hash-chain-demo').boundingBox(),
      });

      // Determinism — re-tamper block 3 and compare.
      await tamper3.click();
      await page.waitForTimeout(200);
      const hashesSecondTamper = await readHashes();
      const deterministic = hashesSecondTamper.every((h, i) => h === hashesAfter[i]);
      record('5c. Tamper cascade is deterministic across cycles', deterministic ? 'pass' : 'fail', {
        note: `2nd=[${hashesSecondTamper.join(',')}]`,
      });

      // Per-position cascade — every tamper N should change indices >= N.
      let perBlockOk = true;
      const perBlockNotes = [];
      for (let n = 0; n < 6; n++) {
        await page.locator('button:has-text("Reset chain")').click();
        await page.waitForTimeout(100);
        const before = await readHashes();
        const btn = page.locator(`button[aria-label^="Tamper with block ${n + 1}"]`);
        await btn.click();
        await page.waitForTimeout(150);
        const after = await readHashes();
        let ok = true;
        for (let i = 0; i < 6; i++) {
          const expectChange = i >= n;
          const changed = after[i] !== before[i];
          if (changed !== expectChange) ok = false;
        }
        if (!ok) perBlockOk = false;
        perBlockNotes.push(`N=${n + 1}:${ok ? 'OK' : 'FAIL'}`);
      }
      record('5d. Cascade correct for every tamper position 1..6', perBlockOk ? 'pass' : 'fail', {
        note: perBlockNotes.join(' '),
      });

      record('1d. No console errors on /', consoleErrors.length === 0 ? 'pass' : 'fail', {
        note: consoleErrors.slice(0, 3).join('; ') || 'none',
      });

      // ScrollTrigger engine isolation hint.
      const stCountOnMarketing = await page.evaluate(() => {
        const w = window;
        return w.__motion?.ScrollTrigger?.getAll?.().length ?? -1;
      });
      record(
        '8a. ScrollTrigger count on / (>0, bounded)',
        stCountOnMarketing > 0 && stCountOnMarketing < 50 ? 'pass' : 'fail',
        { note: `count=${stCountOnMarketing}` },
      );

      await page.close();
    }

    // ─── 2: reduced-motion path on / ───
    {
      const { page } = await visitWithCapture(ctx, '/', '/-reduced', {
        reducedMotion: true,
      });
      await page.evaluate(() => {
        const el = document.getElementById('hash-chain-demo');
        if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
      });
      await page.waitForTimeout(1000);

      const svgRectCount = await page.locator('#hash-chain-demo svg rect[rx="4"]').count();
      record(
        '2a. Reduced-motion: SVG chain renders (6 blocks)',
        svgRectCount === 6 ? 'pass' : 'fail',
        { note: `${svgRectCount} rects` },
      );

      const tamper2 = page.locator('button[aria-label^="Tamper with block 2"]');
      const readH = () =>
        page.$$eval('button[data-hash]', (els) =>
          els
            .slice()
            .sort((a, b) => Number(a.dataset.blockIndex) - Number(b.dataset.blockIndex))
            .map((e) => e.dataset.hash ?? ''),
        );
      const before = await readH();
      await tamper2.click();
      await page.waitForTimeout(150);
      const after = await readH();
      const tamperWorks =
        after[0] === before[0] &&
        after[1] !== before[1] &&
        after[2] !== before[2] &&
        after[5] !== before[5];
      record('2c. Tamper works under reduced-motion', tamperWorks ? 'pass' : 'fail', {
        note: `before=[${before.join(',')}] after=[${after.join(',')}]`,
      });

      // Static post-tamper state — broken glyph lines (the cross
      // marks on blocks 3..6) should render without animation.
      const crossGlyphCount = await page
        .locator('#hash-chain-demo svg line[x2="10"][y2="10"]')
        .count();
      record(
        '2d. Reduced-motion: broken glyphs render statically',
        crossGlyphCount >= 4 ? 'pass' : 'fail',
        { note: `${crossGlyphCount} cross-glyph lines (expect 4 for blocks 3..6)` },
      );

      await page.screenshot({
        path: resolve(OUT_DIR, 'screenshot-04-reduced-motion-after-tamper.png'),
        clip: await page.locator('#hash-chain-demo').boundingBox(),
      });
      await page.close();
    }

    // ─── 3: non-marketing routes do NOT ship HashChainScene chunk ───
    for (const path of ['/get-started', '/wles', '/wles/spec']) {
      const { page, urls } = await visitWithCapture(ctx, path, path);
      await page.waitForTimeout(400);

      const sectionCount = await page.locator('#hash-chain-demo').count();
      record(`3a. HashChainScene not rendered on ${path}`, sectionCount === 0 ? 'pass' : 'fail', {
        note: `${sectionCount} section(s)`,
      });

      const threeBytesUrl = await pageContainsThreeBytes(page);
      record(
        `3b. No Three.js bytes in any chunk loaded by ${path}`,
        threeBytesUrl === null ? 'pass' : 'fail',
        { note: threeBytesUrl ? `Three bytes in ${threeBytesUrl}` : 'clean' },
      );

      const stCount = await page.evaluate(() => {
        const w = window;
        return w.__motion?.ScrollTrigger?.getAll?.().length ?? null;
      });
      record(`8b. ScrollTrigger count on ${path}`, 'info', {
        note: `count=${stCount === null ? 'no __motion' : stCount}`,
      });

      void urls;
      await page.close();
    }

    // ─── Phase 3a: seal stamp evidence ───
    {
      const { page } = await visitWithCapture(ctx, '/', '/-seal-full');
      await page.evaluate(() => {
        const el = document.getElementById('see-it-in-action');
        if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
      });
      await page.waitForTimeout(1500);
      const seal = page.locator('[data-anim="seal"]').first();
      const sealExists = (await seal.count()) > 0;
      record('Phase3a-1. data-anim="seal" element renders', sealExists ? 'pass' : 'fail');

      if (sealExists) {
        const parentStyle = await seal.evaluate((el) => {
          const parent = el.parentElement;
          if (!parent) return null;
          const cs = getComputedStyle(parent);
          return { perspective: cs.perspective, transformStyle: cs.transformStyle };
        });
        const hasPerspective =
          parentStyle &&
          parentStyle.perspective !== 'none' &&
          parentStyle.transformStyle === 'preserve-3d';
        record(
          'Phase3a-2. Seal parent has perspective + preserve-3d',
          hasPerspective ? 'pass' : 'fail',
          { note: JSON.stringify(parentStyle) },
        );

        await page.screenshot({
          path: resolve(OUT_DIR, 'screenshot-05-seal-receipt-full-motion.png'),
          clip: await page.locator('[data-receipt-root]').first().boundingBox(),
        });
      }
      await page.close();
    }

    {
      const { page } = await visitWithCapture(ctx, '/', '/-seal-reduced', {
        reducedMotion: true,
      });
      await page.evaluate(() => {
        const el = document.getElementById('see-it-in-action');
        if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
      });
      await page.waitForTimeout(800);
      const sealOpacity = await page
        .locator('[data-anim="seal"]')
        .first()
        .evaluate((el) => getComputedStyle(el).opacity);
      record(
        'Phase3a-3. Reduced-motion: seal opacity is final (≈0.95) without animation',
        Number(sealOpacity) > 0.9 ? 'pass' : 'fail',
        { note: `opacity=${sealOpacity}` },
      );

      await page.screenshot({
        path: resolve(OUT_DIR, 'screenshot-06-seal-receipt-reduced-motion.png'),
        clip: await page.locator('[data-receipt-root]').first().boundingBox(),
      });
      await page.close();
    }

    await ctx.close();
  } finally {
    await browser.close();
  }

  results.endedAt = new Date().toISOString();
  results.summary = {
    pass: results.checks.filter((c) => c.status === 'pass').length,
    fail: results.checks.filter((c) => c.status === 'fail').length,
    info: results.checks.filter((c) => c.status === 'info').length,
    total: results.checks.length,
  };

  await writeFile(resolve(OUT_DIR, 'verification-results.json'), JSON.stringify(results, null, 2));

  console.log('\n─────────────────────────────────────');
  console.log(`PASS: ${results.summary.pass}`);
  console.log(`FAIL: ${results.summary.fail}`);
  console.log(`INFO: ${results.summary.info}`);
  console.log(`Total: ${results.summary.total}`);
  process.exit(results.summary.fail > 0 ? 1 : 0);
}

await mkdir(OUT_DIR, { recursive: true });
await runChecks();
