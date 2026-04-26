#!/usr/bin/env node
/* eslint-disable */
// Stripe bootstrap — creates the FLOSTRUCTION product catalogue
// per `src/lib/stripe/pricing.ts`. Idempotent: safe to re-run.
//
// Usage:
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-bootstrap.mjs --dry-run
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-bootstrap.mjs --apply
//
// Strategy:
//   - Look up by `lookup_key` (stable across env keys).
//   - If a Price with the lookup_key exists, verify its amount + interval
//     match the catalogue. If mismatched, log a WARN; do NOT modify
//     existing prices (Stripe prices are immutable once created and
//     attached to subscriptions).
//   - If a Price with the lookup_key does not exist, create the parent
//     Product (if needed) and the Price, attaching the lookup_key.
//
// This script is safe to run against TEST mode now and LIVE mode once
// founder completes Stripe verification.

import process from 'node:process';

const SECRET = process.env.STRIPE_SECRET_KEY;
if (!SECRET) {
  console.error('ERROR: STRIPE_SECRET_KEY env var required');
  process.exit(2);
}
const APPLY = process.argv.includes('--apply');
const DRY = !APPLY || process.argv.includes('--dry-run');

if (!APPLY) {
  console.log('Running in DRY-RUN mode. Pass --apply to mutate Stripe.');
}

// ── Catalogue (mirrors src/lib/stripe/pricing.ts TIERS) ───────────────
// Kept inline so this script has zero TS-build dependency.
const CATALOGUE = [
  {
    product_name: 'FLOSTRUCTION Founding Cohort',
    product_description: 'Founding-cohort customers (1–20). 3-year price lock from signup_completed_at.',
    prices: [
      { lookup_key: 'founding-monthly', amount_cents: 39900, interval: 'month' },
    ],
  },
  {
    product_name: 'FLOSTRUCTION Standard',
    product_description: 'Up to 25 active workers OR up to 500 sealed shifts/month.',
    prices: [
      { lookup_key: 'standard-monthly', amount_cents: 49900, interval: 'month' },
      { lookup_key: 'standard-yearly',  amount_cents: 538920, interval: 'year' },
    ],
  },
  {
    product_name: 'FLOSTRUCTION Growth',
    product_description: '26–75 active workers OR 501–2,000 sealed shifts/month.',
    prices: [
      { lookup_key: 'growth-monthly', amount_cents: 99900, interval: 'month' },
      { lookup_key: 'growth-yearly',  amount_cents: 1078920, interval: 'year' },
    ],
  },
  {
    product_name: 'FLOSTRUCTION Scale',
    product_description: '76–200 active workers OR 2,001–5,000 sealed shifts/month.',
    prices: [
      { lookup_key: 'scale-monthly', amount_cents: 199900, interval: 'month' },
      { lookup_key: 'scale-yearly',  amount_cents: 2158920, interval: 'year' },
    ],
  },
  // Enterprise is bespoke — no Stripe price object created automatically.
];

// ── Stripe REST helpers (no SDK dep) ─────────────────────────────────
async function stripeReq(path, method, body) {
  const url = `https://api.stripe.com/v1${path}`;
  const init = { method, headers: { Authorization: `Bearer ${SECRET}` } };
  if (body) {
    init.body = new URLSearchParams(body).toString();
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  const res = await fetch(url, init);
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Stripe ${method} ${path} failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json;
}

async function findPriceByLookupKey(lookup_key) {
  const r = await stripeReq(
    `/prices/search?query=${encodeURIComponent(`lookup_key:'${lookup_key}'`)}&limit=10`,
    'GET',
  );
  return r.data?.[0] ?? null;
}

async function findProductByName(name) {
  // Stripe doesn't have a "search by name" so we iterate listings.
  // Acceptable for ~5 products.
  const r = await stripeReq('/products?active=true&limit=100', 'GET');
  return r.data?.find((p) => p.name === name) ?? null;
}

async function ensureProduct(spec) {
  const existing = await findProductByName(spec.product_name);
  if (existing) {
    console.log(`  product OK    : ${spec.product_name} (${existing.id})`);
    return existing;
  }
  if (DRY) {
    console.log(`  product CREATE: ${spec.product_name} (dry-run)`);
    return { id: '<dry-run>' };
  }
  const created = await stripeReq('/products', 'POST', {
    name: spec.product_name,
    description: spec.product_description,
  });
  console.log(`  product CREATE: ${spec.product_name} (${created.id})`);
  return created;
}

async function ensurePrice(product, price) {
  const existing = await findPriceByLookupKey(price.lookup_key);
  if (existing) {
    const mismatch =
      existing.unit_amount !== price.amount_cents ||
      existing.recurring?.interval !== price.interval ||
      existing.currency !== 'aud';
    if (mismatch) {
      console.log(`  price WARN    : ${price.lookup_key} exists but differs (` +
        `existing: ${existing.unit_amount} ${existing.currency}/` +
        `${existing.recurring?.interval ?? '?'}; expected: ` +
        `${price.amount_cents} aud/${price.interval}). ` +
        `Stripe prices are immutable once attached to subscriptions; manual review required.`);
      return existing;
    }
    console.log(`  price OK      : ${price.lookup_key} (${existing.id})`);
    return existing;
  }
  if (DRY) {
    console.log(`  price CREATE  : ${price.lookup_key} (dry-run)`);
    return { id: '<dry-run>' };
  }
  const created = await stripeReq('/prices', 'POST', {
    product: product.id,
    unit_amount: String(price.amount_cents),
    currency: 'aud',
    'recurring[interval]': price.interval,
    lookup_key: price.lookup_key,
  });
  console.log(`  price CREATE  : ${price.lookup_key} (${created.id})`);
  return created;
}

// ── Main ──────────────────────────────────────────────────────────────
(async () => {
  console.log(`\nFLOSTRUCTION Stripe bootstrap`);
  console.log(`Mode: ${DRY ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Key prefix: ${SECRET.slice(0, 8)}…\n`);

  for (const spec of CATALOGUE) {
    console.log(`\n· ${spec.product_name}`);
    const product = await ensureProduct(spec);
    for (const price of spec.prices) {
      await ensurePrice(product, price);
    }
  }

  console.log(`\nDone.`);
})().catch((e) => {
  console.error('\nFAILED:', e.message);
  process.exit(1);
});
