# F1 — flosmosis.com domain migration checklist

**Status:** DRAFT. Do NOT execute tonight. Follow top-to-bottom in a
single sitting once Lauren is awake and ready.

## Current state (2026-04-21 snapshot)

Three domain names co-exist in the codebase and config:

| Domain | Where | Purpose |
|---|---|---|
| `flosmosis.com` | Most page copy, SMS `backupUrl`, privacy page, approve page, founding page | Primary public site (target) |
| `flosmosis.com.au` | Email addresses (`lauren@flosmosis.com.au`, `noreply@flosmosis.com.au`) | Legacy inbox route |
| `wohjo.app` | Resend `from:` in `src/lib/email/notify.ts` | Legacy sender identity |

The migration target: **everything public on `flosmosis.com`**, with
`lauren@flosmosis.com` as the human inbox (after MX cutover) and
`noreply@flosmosis.com` as the automated sender.

## Prerequisites (must be true before starting)

- [ ] `flosmosis.com` domain is registered and Lauren controls the DNS
      zone.
- [ ] Vercel project exists and the Vercel team can own the apex +
      `www.` of `flosmosis.com`.
- [ ] Resend account has domain verification status ready for
      `flosmosis.com` (see F2 plan).
- [ ] Twilio messaging service webhook URL is editable (Lauren has
      Twilio console access).
- [ ] Supabase project URL stays on `*.supabase.co` — NOT migrating.

## Section A — DNS records (Cloudflare or registrar console)

| Type | Name | Value | Proxy | TTL |
|---|---|---|---|---|
| A | `@` | (Vercel IP from project settings, usually `76.76.21.21`) | DNS only | 1h |
| CNAME | `www` | `cname.vercel-dns.com` | DNS only | 1h |
| TXT | `_vercel` | (Vercel's verification TXT, shown in dashboard) | — | 5m |
| MX | `@` | per email provider (Google Workspace: `1 aspmx.l.google.com.` etc.) | — | 1h |
| TXT | `@` | `v=spf1 include:_spf.resend.com include:_spf.google.com ~all` | — | 1h |
| TXT | `resend._domainkey` | (DKIM value from Resend F2 flow) | — | 1h |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:lauren@flosmosis.com` | — | 1h |

Note: DMARC starts at `p=quarantine` not `reject` so any misconfig
surfaces in the report rather than silently dropping legitimate mail.
Raise to `reject` after 2 weeks of clean reports.

## Section B — Vercel project configuration

- [ ] Add `flosmosis.com` and `www.flosmosis.com` as custom domains in
      Vercel project settings.
- [ ] Set the production branch alias to `flosmosis.com` (primary).
- [ ] Set `www.flosmosis.com` as a redirect alias to the apex.
- [ ] Wait for HTTPS certificate provisioning (typically <5 min).

## Section C — Environment variables (Vercel dashboard → Settings → Environment Variables)

Update for all three environments (Production, Preview, Development).
Each row is "name — target value". **Do not paste secrets into this
file; lookup values from Vercel or the source service.**

| Env var | Target value | Source |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://flosmosis.com` | Manually set |
| `TWILIO_FROM_NUMBER` | (unchanged — the AU number Lauren owns) | Twilio console |
| `RESEND_API_KEY` | (unchanged — account-level) | Resend dashboard |
| `ALERT_EMAIL_TO` | `lauren@flosmosis.com` (after MX cuts over) | Manually set |
| `CRON_SECRET` | (unchanged — rotate if compromised) | Lauren's secrets vault |
| `NEXT_PUBLIC_SUPABASE_URL` | (unchanged — stays on supabase.co) | Supabase dashboard |

## Section D — Code changes (commit to a single branch `chore/f1-domain-migration`)

### D.1 — Replace `wohjo.app` sender with `flosmosis.com`

**File:** `src/lib/email/notify.ts`

Three occurrences of `from: 'Flostruction <noreply@wohjo.app>'` — all
three become `from: 'Flostruction <noreply@flosmosis.com>'`.

```diff
-    from: 'Flostruction <noreply@wohjo.app>',
+    from: 'Flostruction <noreply@flosmosis.com>',
```

Prerequisite: F2 (Resend domain verification) must be complete for
`flosmosis.com` before this change deploys, otherwise emails bounce.

### D.2 — Replace `@flosmosis.com.au` sender with `@flosmosis.com`

**Files:** `src/app/api/founding/route.ts` (4 occurrences),
`src/app/api/cron/approval-fallback/route.ts` (1),
`src/app/approve/[token]/page.tsx` (2 "contact" mentions),
`src/app/founding/page.tsx` (1 footer).

For every `noreply@flosmosis.com.au` / `lauren@flosmosis.com.au` /
`privacy@flosmosis.com`:

```diff
-          from: 'FLOSTRUCTION <noreply@flosmosis.com.au>',
+          from: 'FLOSTRUCTION <noreply@flosmosis.com>',

-          to: 'lauren@flosmosis.com.au',
+          to: 'lauren@flosmosis.com',
```

Decision point: does `lauren@flosmosis.com.au` still forward to
Lauren's actual inbox? If yes, consider keeping it as a **secondary**
`to:` during a 2-week dual-delivery window:

```ts
to: ['lauren@flosmosis.com', 'lauren@flosmosis.com.au'],
```

Then remove the `.com.au` after confirming nothing's going only there.

### D.3 — Replace hardcoded `https://flosmosis.com` fallbacks with the env var

Several files already read `process.env.NEXT_PUBLIC_APP_URL` but with
a hardcoded `?? 'https://flosmosis.com'`. Keep the fallback, it's
correct for the new domain.

**Spot-check locations** (no action needed if value is already
`https://flosmosis.com`):
- `src/app/api/cron/approval-fallback/route.ts:119`
- `src/app/api/cron/supervisor-batch/route.ts:161`
- `src/app/api/webhooks/twilio/sms-reply/route.ts:149,541`
- `src/lib/sms/late-trigger.ts:82`

### D.4 — Manifest and metadata

**File:** `src/app/manifest.ts`

Change brand name from "Flostruction" to whatever production brand
survives the migration. (The B6 A2HS work noted a pending WOHJO brand
sweep — if you're already on flosmosis.com for the migration, you may
want to collapse to one name.)

Current manifest shows `name: 'Flostruction Field'` and uses `#0d1117`
as theme. Decide now or defer to a separate branch.

### D.5 — Update tests

**File:** `src/lib/sms/compose.test.ts`

Two test fixtures hardcode `https://flosmosis.com/v/test-token`. They
stay correct once migration lands; no change needed, but confirm
`npx vitest run src/lib/sms/compose.test.ts` passes after D.1-D.4.

## Section E — Twilio webhook URL

- [ ] In Twilio console → Messaging → Services → (the WOHJO service) →
      Integration tab:
  - `A message comes in` webhook URL:
    `https://flosmosis.com/api/webhooks/twilio/sms-reply` (POST, URL-encoded).
- [ ] Save. Send a test SMS from Lauren's phone to the Twilio number;
      confirm the inbound webhook lands (Vercel logs + Supabase
      `webhook_idempotency` row).

## Section F — Resend domain verification

See companion plan `docs/F2-resend-domain-verification.md`. Must be
complete before D.1 merges.

## Section G — Redirects and canonical

Add `next.config.js` rewrites/redirects for:

```js
module.exports = {
  // Permanent redirect from www to apex (Vercel also does this at the
  // domain layer; this is belt-and-braces at the app layer).
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.flosmosis.com' }],
        destination: 'https://flosmosis.com/:path*',
        permanent: true,
      },
      // Legacy flosmosis.com.au permanent redirect (if that domain is
      // kept active during the transition — else skip).
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'flosmosis.com.au' }],
        destination: 'https://flosmosis.com/:path*',
        permanent: true,
      },
    ];
  },
};
```

Only include the `.com.au` block if flosmosis.com.au is currently
pointed at Vercel. If it's just an email-only MX zone with no web
content, skip.

## Section H — Supabase Auth redirect URLs

In Supabase dashboard → Authentication → URL Configuration:

- Site URL: `https://flosmosis.com`
- Additional redirect URLs (keep existing previews intact):
  - `https://flosmosis.com/*`
  - `https://www.flosmosis.com/*`
  - `https://*.vercel.app/*` (for preview deployments)

## Section I — Smoke tests after cutover

Run in order, confirm each passes before moving on. Fail any — stop
and roll back (point DNS back at the previous target).

1. [ ] `curl -sI https://flosmosis.com` returns `200 OK` with the
       correct Next.js `x-nextjs-cache` header.
2. [ ] `curl -sI https://www.flosmosis.com` returns `301` to apex.
3. [ ] Open `https://flosmosis.com/founding` — form renders, submit a
       test lead with a burner phone, confirm row lands in Supabase
       `founding_leads` AND Resend email lands in Lauren's inbox.
4. [ ] Open `https://flosmosis.com/demo` — Bravo synthetic data renders
       with banner.
5. [ ] Open `https://flosmosis.com/privacy` — renders with contact
       email `privacy@flosmosis.com`.
6. [ ] `curl -X POST -H "x-cron-secret: $CRON_SECRET" https://flosmosis.com/api/cron/keepalive`
       returns `{ status: 'alive', ... }`.
7. [ ] Send test SMS to the Twilio number from Lauren's phone — confirm
       webhook fires (Vercel logs + Supabase `webhook_idempotency` new row).
8. [ ] Open `https://flosmosis.com/field` — login form renders, phone
       OTP still works against the Supabase auth endpoint.

## Section J — Rollback plan (if smoke tests fail)

1. Revert DNS A and CNAME records to pre-migration values (save them
   before starting).
2. Re-deploy the prior Vercel production deployment (one-click from
   dashboard → Deployments → previous → "Promote to Production").
3. Investigate failure in Vercel logs + Supabase logs + Twilio event
   console.
4. Create a debrief entry in `gate-reports/F1-rollback-<date>.md`.

## Section K — Post-migration cleanup (1 week after)

- [ ] Remove the dual-delivery `to:` in D.2 if it was used.
- [ ] Remove the `flosmosis.com.au` redirect in Section G if that zone
      has been parked or retired.
- [ ] Raise DMARC `p=quarantine` → `p=reject` after two clean weekly
      reports.
- [ ] Update all Google / LinkedIn / support / business-registration
      profiles that mention `flosmosis.com.au` to `flosmosis.com`.
- [ ] Update ASIC company record if the previously registered business
      address email points to `.com.au`.

## Blocked today

- Cannot execute anything — needs Lauren's registrar and Vercel
  console access.
- Cannot confirm whether `flosmosis.com.au` is still live as a web
  property or only an MX zone — affects Section G.
- Needs F2 Resend verification to be complete before D.1 merges or
  outbound email breaks.
