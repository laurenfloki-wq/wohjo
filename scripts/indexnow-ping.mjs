#!/usr/bin/env node
// IndexNow post-deploy ping — best-effort, bounded, no silent failures.
//
// Submits the production indexable URL set to IndexNow so Bing, Yandex and
// other IndexNow consumers re-crawl within minutes instead of waiting on
// their own schedule. Complements (does not replace) GSC/Bing sitemap
// submission.
//
// URL source: the deployed production sitemap.xml, which is rendered from
// the single shared route source (src/lib/seo/routes.ts → getIndexableUrls,
// also used by src/app/sitemap.ts). The script reads that rendered output,
// so it always pings exactly what is live — no second hard-coded URL list.
//
// Trigger: .github/workflows/indexnow.yml runs this on a successful
// PRODUCTION deployment only. It always targets the production host, so it
// never pings preview URLs. IndexNow tolerates re-submission of unchanged
// URLs, so running it on every production deploy is safe and idempotent.
//
// Failure policy: any error (missing key, sitemap fetch, IndexNow non-2xx,
// network) is logged and the process exits 0. IndexNow being down must
// never look like a deploy failure.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HOST = 'flosmosis.com';
const SITE = `https://${HOST}`;
// Defaults to the real IndexNow endpoint. INDEXNOW_ENDPOINT is a test-only
// override so the failure path can be exercised without a real submission.
const ENDPOINT = process.env.INDEXNOW_ENDPOINT || 'https://api.indexnow.org/indexnow';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');

// Key resolution: prefer the env var (set in Vercel / CI, per the secrets
// inventory). Fall back to the committed, public key file — its name stem
// equals its body by construction, which uniquely identifies it (robots.txt
// and any other .txt do not match), so the ping still works in CI without a
// separate secret.
function resolveKey() {
  const fromEnv = process.env.INDEXNOW_KEY?.trim();
  if (fromEnv) return fromEnv;
  try {
    for (const name of readdirSync(publicDir)) {
      if (!name.endsWith('.txt')) continue;
      const stem = name.slice(0, -4);
      const body = readFileSync(join(publicDir, name), 'utf8').trim();
      if (stem === body && /^[a-f0-9]{32}$/i.test(body)) return body;
    }
  } catch {
    // fall through to the no-key warning below
  }
  return null;
}

async function fetchSitemapUrls() {
  const res = await fetch(`${SITE}/sitemap.xml`, { headers: { Accept: 'application/xml' } });
  if (!res.ok) throw new Error(`sitemap fetch ${res.status} ${res.statusText}`);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()).filter(Boolean);
}

async function main() {
  const key = resolveKey();
  if (!key) {
    console.error('[indexnow] no key (INDEXNOW_KEY unset and no public key file) — skipping ping');
    return;
  }

  let urlList;
  try {
    urlList = await fetchSitemapUrls();
  } catch (err) {
    console.error(`[indexnow] could not read ${SITE}/sitemap.xml — skipping ping:`, err);
    return;
  }
  if (!urlList.length) {
    console.error('[indexnow] sitemap returned no URLs — skipping ping');
    return;
  }

  const payload = {
    host: HOST,
    key,
    keyLocation: `${SITE}/${key}.txt`,
    urlList,
  };

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    });
    // IndexNow returns 200 (accepted) or 202 (accepted, pending). Anything
    // else is logged but not fatal.
    if (res.ok) {
      console.log(`[indexnow] submitted ${urlList.length} URLs — ${res.status} ${res.statusText}`);
    } else {
      const detail = await res.text().catch(() => '');
      console.error(`[indexnow] non-2xx ${res.status} ${res.statusText} ${detail}`.trim());
    }
  } catch (err) {
    console.error('[indexnow] ping request failed:', err);
  }
}

// Best-effort: never throw out of the process.
main().catch((err) => {
  console.error('[indexnow] unexpected error:', err);
});
