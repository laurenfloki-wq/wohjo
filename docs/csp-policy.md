# Content Security Policy

CRACK 211 — implements Cowork's CSP Integration Spec
(Notion `35b06f9432dd812fade2ea05b9351859`, local copy at
`cowork-output/WS6-CSP-INTEGRATION-SPEC-2026-05-09.md`).

This PR ships the policy in **report-only** mode. Promotion to enforce is
a separate PR after Mo onboards and we have 1–2 weeks of clean violation
telemetry.

## TL;DR

- New header: `Content-Security-Policy-Report-Only` set per request from
  `src/middleware.ts`.
- Reports POST to `/api/csp-report`, logged via pino as `csp.violation`,
  visible in Vercel runtime logs.
- The looser **enforcing** CSP currently in `vercel.json` continues to run
  unchanged. Browsers process the two headers independently — enforce
  blocks what it always blocked; report-only tells us what the tighter
  policy *would* break, without breaking it.

## Directive list (report-only)

```
default-src 'self';
script-src  'self' 'nonce-{NONCE}' https://js.stripe.com;
style-src   'self' 'unsafe-inline';
img-src     'self' data: blob: https://*.supabase.co;
font-src    'self';
connect-src 'self'
            https://*.supabase.co
            wss://*.supabase.co
            https://api.stripe.com
            https://r.stripe.com;
frame-src   https://js.stripe.com https://hooks.stripe.com;
worker-src  'self' blob:;
manifest-src 'self';
form-action 'self';
frame-ancestors 'none';
base-uri 'self';
report-uri /api/csp-report;
```

## Host inventory & rationale

| Directive       | Host / scheme                              | Why                                                                 |
| --------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| `script-src`    | `'self'`                                   | First-party JS bundles served by Next/Vercel.                       |
| `script-src`    | `'nonce-{NONCE}'`                          | Per-request hydration scripts; rotated every request.               |
| `script-src`    | `https://js.stripe.com`                    | Stripe.js — PCI-DSS requires loading from Stripe CDN.               |
| `style-src`     | `'unsafe-inline'`                          | Radix UI / Shadcn applies inline transform/left/top for floating UI. Removing breaks Dropdown/Tooltip/Popover/Sheet. Risk accepted; img-src + connect-src restrict exfiltration vectors. |
| `img-src`       | `data:`, `blob:`                           | next/image placeholders, html2canvas receipt rendering, capture.    |
| `img-src`       | `https://*.supabase.co`                    | Supabase Storage object URLs (selfies, attachments).                |
| `font-src`      | `'self'`                                   | next/font self-hosts Google Fonts at build time. Runtime never hits fonts.googleapis.com. |
| `connect-src`   | `https://*.supabase.co`, `wss://*.supabase.co` | Supabase REST / Realtime / Storage subdomains. wss must be listed explicitly — https does not cover WebSockets. |
| `connect-src`   | `https://api.stripe.com`, `https://r.stripe.com` | Stripe API + Stripe Radar telemetry.                                |
| `frame-src`     | `https://js.stripe.com`, `https://hooks.stripe.com` | Stripe payment iframe + 3DS challenge iframe.                       |
| `worker-src`    | `'self'`, `blob:`                          | Serwist service worker (currently disabled; staying allowlisted).   |
| `manifest-src`  | `'self'`                                   | PWA manifest.                                                       |
| `frame-ancestors` | `'none'`                                 | WOHJO Field must never be embedded.                                 |
| `form-action`   | `'self'`                                   | All form posts go to first-party.                                   |
| `base-uri`      | `'self'`                                   | Locks down `<base>` injection.                                      |

### Hosts intentionally **not** included

- `https://vitals.vercel-analytics.com`, `https://va.vercel-scripts.com` —
  Vercel Analytics / Speed Insights are not installed in this app
  (Cowork OQ1 default). Add back here if we install `@vercel/analytics`.
- Map providers, Intercom, marketing-domain embeds — none planned for MVP
  (OQ2–OQ4 defaults).

## Nonce strategy

`src/middleware.ts` generates 16 random bytes via `crypto.getRandomValues`,
base64-encodes them, and emits the nonce in two places on every request:

1. The `script-src` directive of `Content-Security-Policy-Report-Only`
   (`'nonce-...'`).
2. The `x-nonce` header on both the forwarded request (so server components
   can read it via `headers()`) and the response.

`src/app/layout.tsx` reads the nonce from `headers()` and reflects it into
`<html data-csp-nonce>`. Pass it as the `nonce` prop to any inline
`<Script>` you add later — Next.js forwards the prop onto the rendered
`<script>` element. Today the layout has no inline scripts, so the wiring
is precautionary.

Hash-based scripts were considered and rejected: Next's hydration
inline payload varies per request, so a static SHA-256 hash list is not
viable.

## Report endpoint

`POST /api/csp-report` (`src/app/api/csp-report/route.ts`) — auth-free,
accepts the W3C CSP report envelope (`{ "csp-report": { ... } }`) or the
bare-object shape, and:

- Caps body at 10 KB (returns 413 on overrun).
- Rate-limits to 100 reports/min/IP (returns 429 when exceeded).
- Always returns 204 on accepted requests; never echoes data back.
- Logs each violation via the shared pino logger:

  ```jsonc
  {
    "level": "warn",
    "msg": "csp.violation",
    "event": "csp_violation",
    "blocked_uri": "...",
    "violated_directive": "...",
    "effective_directive": "...",
    "document_uri": "...",
    "source_file": "...",
    "line_number": ...,
    "column_number": ...
  }
  ```

Reports are **not** written to Supabase. A DB write here would risk a
violation-feedback loop if the DB call ever caused a CSP violation itself.

## Monitoring procedure

While the policy is report-only:

1. Each weekday morning, read the Vercel runtime log stream filtered to
   `csp.violation` (`level=warn msg=csp.violation`).
2. Triage every violation into one of:
   - **Legitimate first-party** — host should be added to the directive
     list. Open a follow-up PR; do not delay enforce promotion until it
     ships.
   - **Known third-party noise** (browser extensions inject scripts and
     hit `blocked-uri: chrome-extension:` / `moz-extension:`) — ignore.
   - **Genuine attack signal** — escalate to security review and block
     the source.
3. Track each triage decision in CRACK 211's Notion comment thread until
   we promote.

## Promotion checklist (report-only → enforce)

Promote when **all** are true:

- [ ] 7 days of production traffic on the report-only header.
- [ ] Zero violations from app-legitimate sources (extension noise OK).
- [ ] Lauren has reviewed the Vercel log stream for the full window.
- [ ] Mo has been onboarded onto a real device with no field issues.

The promotion PR will:

1. Remove the looser enforce CSP block from `vercel.json` (the
   `Content-Security-Policy` entry — the rest of the security headers
   stay).
2. Rename the middleware response header from
   `Content-Security-Policy-Report-Only` to `Content-Security-Policy`.
3. Leave the report endpoint and reporting in place — useful telemetry
   even after enforce flips.

## Coexistence with the existing enforce CSP

`vercel.json` already declares an enforcing `Content-Security-Policy` with
`'unsafe-inline'` / `'unsafe-eval'` allowed. That header is unchanged by
this PR. Browsers honor both headers independently:

- `Content-Security-Policy` (vercel.json, looser): blocks what it has
  always blocked. App keeps working.
- `Content-Security-Policy-Report-Only` (middleware, tighter): logs what
  *would* break under the new policy, without enforcing it.

This is exactly the deployment shape the spec calls for. The two headers
diverge again at promotion: the looser enforce header is removed, and
the tighter header is renamed to enforce.

## 2026-06-12 — pre-enforce catch + fix (report-only retained)

The PR #93 pre-merge device test surfaced un-nonced Next.js framework
inline scripts (`__next_f` bootstrap) — the proxy minted the nonce but
never forwarded the policy on the request headers, which is how Next
discovers and applies it. Enforcing at that point would have blocked
every page. Fix: forward `Content-Security-Policy` on the request
(internal; browsers never see it) + add `'strict-dynamic'` so scripts
loaded by nonced scripts (Next chunks, Stripe.js children) inherit
trust. Promotion checklist unchanged: re-run the device console test
(expect zero violations) before flipping PR #93.
