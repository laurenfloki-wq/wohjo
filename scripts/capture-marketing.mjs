// Marketing v5 capture harness — proof-pack screenshots for the
// flostruction-v5 redesign gate (brief, BULLETPROOF GATE).
//
// Mirrors the verify-motion.mjs pattern: Playwright chromium against
// a served build (local `next start` or the Vercel preview URL).
//
//   URL=https://<preview>.vercel.app node scripts/capture-marketing.mjs
//
// Captures:
//   01 hero loaded (entrance settled)
//   02 scene · press beat            (~t1300 of the scene clock)
//   03 scene · ENDED / AWAITING beat (~t3100)
//   04 scene · mid-SMS               (~t6500)
//   05 scene · sealed beat           (~t11600)
//   06 chain · built (pre-tamper)
//   07 chain · tampered
//   08 closing + footer
//   09-13 · 390 px mobile equivalents (hero, scene sealed, chain
//          tampered, closing)
//   14-15 · reduced-motion end states (surfaces, chain)
// Console messages are recorded across the run; any error/warning
// fails the gate (gate item: console clean).

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const URL = process.env.URL || 'http://127.0.0.1:3000/';
const OUT = resolve(process.env.OUT || 'gate-reports/marketing-v5');
await mkdir(OUT, { recursive: true });

const consoleLog = [];
const results = { url: URL, timestamp: new Date().toISOString(), captures: [], console: consoleLog };

const browser = await chromium.launch({ headless: true });

async function newPage(ctxOpts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...ctxOpts,
  });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      consoleLog.push({ type: m.type(), text: m.text().slice(0, 400) });
    }
  });
  page.on('pageerror', (e) => consoleLog.push({ type: 'pageerror', text: String(e).slice(0, 400) }));
  return { ctx, page };
}

async function shot(page, name) {
  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file });
  results.captures.push(name);
  console.log('capture:', name);
}

/* ---------- desktop pass ---------- */
{
  const { ctx, page } = await newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600); /* hero entrance settles */
  await shot(page, '01-hero-loaded');

  /* The scene: scroll #surfaces into view; IO fires at 40% + 700 ms
     grace, then the beat sheet runs on the scene clock. */
  await page.locator('#surfaces').scrollIntoViewIfNeeded();
  const sceneStart = Date.now();
  const atBeat = async (ms, name) => {
    const wait = ms - (Date.now() - sceneStart);
    if (wait > 0) await page.waitForTimeout(wait);
    await shot(page, name);
  };
  /* grace 700 + beat offsets */
  await atBeat(700 + 1300, '02-scene-press');
  await atBeat(700 + 3100, '03-scene-ended-awaiting');
  await atBeat(700 + 6500, '04-scene-mid-sms');
  await atBeat(700 + 11600, '05-scene-sealed');

  /* chain: build then tamper (build completes ~2400 ms after entry;
     tamper at ~3500 ms) */
  await page.locator('#chain').scrollIntoViewIfNeeded();
  await page.waitForTimeout(2300);
  await shot(page, '06-chain-built');
  await page.waitForTimeout(2600);
  await shot(page, '07-chain-tampered');

  await page.locator('.closing').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1400);
  await shot(page, '08-closing-footer');

  /* one replay for the console-clean check */
  await page.locator('#surfaces').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Replay scene' }).click();
  await page.waitForTimeout(12000);
  await ctx.close();
}

/* ---------- 390 px mobile pass ---------- */
{
  const { ctx, page } = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);
  await shot(page, '09-mobile-hero');
  await page.locator('#surfaces').scrollIntoViewIfNeeded();
  await page.waitForTimeout(700 + 11600 + 400);
  await shot(page, '10-mobile-scene-sealed');
  await page.locator('#chain').scrollIntoViewIfNeeded();
  await page.waitForTimeout(5200);
  await shot(page, '11-mobile-chain-tampered');
  await page.locator('.closing').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1400);
  await shot(page, '12-mobile-closing');
  await ctx.close();
}

/* ---------- reduced-motion pass — end states, no animation ---------- */
{
  const { ctx, page } = await newPage({ reducedMotion: 'reduce' });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.locator('#surfaces').scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await shot(page, '13-reduced-surfaces-endstate');
  await page.locator('#chain').scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await shot(page, '14-reduced-chain-endstate');
  await ctx.close();
}

await browser.close();
results.consoleClean = consoleLog.length === 0;
await writeFile(`${OUT}/capture-report.json`, JSON.stringify(results, null, 2));
console.log('console clean:', results.consoleClean, `(${consoleLog.length} entries)`);
if (!results.consoleClean) {
  console.log(JSON.stringify(consoleLog.slice(0, 20), null, 2));
  process.exitCode = 1;
}
