# F2 — Resend domain verification for flosmosis.com

**Status:** DRAFT. Do NOT execute tonight. Execute in the morning
BEFORE the F1 code changes merge — if the domain isn't verified,
Resend will reject every outbound message.

## Why

Resend (like every reputable mail provider) won't let you send from
`@flosmosis.com` until it has proof Lauren controls the domain. The
proof is SPF + DKIM + optionally DMARC records in DNS.

## Prerequisites

- [ ] Resend account exists and Lauren has admin access.
- [ ] `flosmosis.com` DNS is under Lauren's direct control (not held
      by a previous developer).
- [ ] DNS provider console access (Cloudflare, Namecheap, Route 53,
      whoever).

## Section A — Start the verification in Resend

1. Sign in to Resend dashboard.
2. Domains → Add Domain.
3. Name: `flosmosis.com`.
4. Region: pick the one closest to your Vercel deployment. Default
   `us-east-1` is fine; there is no data-residency constraint yet.
5. Resend shows a set of DNS records to add. Capture them verbatim —
   values change per account so the exact DKIM value cannot be written
   into this plan ahead of time. Expect:

| Record type | Host | Value (example shape) | Purpose |
|---|---|---|---|
| TXT  | `send`         | `v=spf1 include:amazonses.com ~all`          | SPF — authorises Resend's SES infra to send on behalf of flosmosis.com |
| TXT  | `resend._domainkey` | `p=MIIBIjANBgkqhkiG9w0B... (long key)`   | DKIM — signs outbound messages |
| MX   | `send`         | `10 feedback-smtp.<region>.amazonses.com`   | Bounce/complaint return-path |
| TXT  | `_dmarc`       | `v=DMARC1; p=quarantine; rua=mailto:lauren@flosmosis.com` | Authenticator policy + reporting |

> Resend prefixes its DNS additions at `send.flosmosis.com` so they
> don't collide with records for the root `@`. That means if Lauren
> later adds Google Workspace SPF at `@`, it stays separate from the
> Resend SPF at `send`. Confirm the host column when pasting.

## Section B — Add the DNS records

Where Lauren's zone lives today (TODO: confirm registrar — likely
Cloudflare based on context).

### Cloudflare flow

1. Log into Cloudflare → select the `flosmosis.com` zone.
2. DNS → Records → Add Record.
3. For each Resend record:
   - Type: match the type shown in Resend dashboard.
   - Name: paste the subdomain shown (e.g. `send` — Cloudflare will
     not add `.flosmosis.com` twice).
   - Target / Content: paste the value verbatim. Be careful with
     long DKIM TXT values — Cloudflare wraps them transparently, no
     manual splitting needed.
   - Proxy status: **DNS only** (grey cloud, not orange). Proxied
     TXTs break verification.
   - TTL: 5 minutes during initial verification; raise to 1 hour
     once verified.
4. Save.

### Other registrars

- Namecheap: Advanced DNS tab → Add Record → same fields.
- Route 53: zone → Create record → Simple routing → pick each type.
- Other: generic DNS UI almost always has the same Type/Host/Value triad.

## Section C — Trigger Resend verification

1. Back in Resend → Domains → flosmosis.com → **Verify DNS records**.
2. Resend polls DNS. SPF + DKIM usually propagate in 5-15 minutes.
   DMARC tends to resolve within an hour.
3. Status transitions: **Pending → Verified** for each record.
4. When **all are green**, the domain is usable as a `from:` address.

If stuck after 30 minutes, run a third-party check to see what DNS
actually serves:

```
dig TXT send.flosmosis.com +short
dig TXT resend._domainkey.flosmosis.com +short
dig MX  send.flosmosis.com +short
dig TXT _dmarc.flosmosis.com +short
```

Compare against what Resend wants. Most common failures:

- Value copied with leading/trailing whitespace → re-paste.
- Proxy (orange cloud) is on in Cloudflare → switch to DNS-only.
- DKIM value got truncated by the DNS UI — re-paste as a single line.
- TTL mismatch with a previous SOA serial — wait 15 more minutes.

## Section D — Code changes that depend on verification

These are the D.1 and D.2 items from `docs/F1-flosmosis-domain-migration.md`.
They are SAFE to merge only AFTER Section C shows all green.

### D.1 — `src/lib/email/notify.ts`

3 occurrences:

```diff
-    from: 'Flostruction <noreply@wohjo.app>',
+    from: 'Flostruction <noreply@flosmosis.com>',
```

### D.2 — `src/app/api/founding/route.ts`

4 occurrences of sender or recipient using `.com.au`:

```diff
-          from: 'FLOSTRUCTION <noreply@flosmosis.com.au>',
+          from: 'FLOSTRUCTION <noreply@flosmosis.com>',
```

```diff
-          to: 'lauren@flosmosis.com.au',
+          to: 'lauren@flosmosis.com',
```

### D.3 — `src/app/api/cron/approval-fallback/route.ts`

1 occurrence of `from: 'FLOSTRUCTION <noreply@flosmosis.com.au>'` →
`from: 'FLOSTRUCTION <noreply@flosmosis.com>'`.

### D.4 — Resend "send from" convention

Decide between two shapes — material but small tradeoff:

| Option | From address | Pros | Cons |
|---|---|---|---|
| A | `noreply@flosmosis.com` | Simple. Matches prior pattern. | If you later add support@ etc., all share the same root zone. |
| B | `noreply@send.flosmosis.com` | Cleanly separates transactional mail from human inbox. DMARC policies can be scoped per subdomain. | Mildly confusing address for recipients who read the literal `from:`. |

**Default recommendation: Option A** (simpler, matches the UI copy
"FLOSTRUCTION <noreply@flosmosis.com>" already in the codebase). Flag
the decision in the commit message so it's reviewable.

## Section E — Smoke test after verification

One end-to-end proof before the D.1–D.3 code rolls out:

1. In Resend dashboard, click **Send Test Email**.
2. From: `Flostruction Test <noreply@flosmosis.com>`.
3. To: Lauren's personal inbox.
4. Subject: `F2 verification test`.
5. Body: anything.
6. Hit Send. Confirm arrival in under 30 seconds. Check the message
   headers:
   - `Authentication-Results` should show `spf=pass` and `dkim=pass`.
   - `From` should render `Flostruction Test <noreply@flosmosis.com>`
     not a noreply+amazonses synthetic address.

## Section F — Post-verification housekeeping

- [ ] In the WOHJO repo, update `.env.local` example (if any) and
      deployment docs to reflect the new `from:` convention.
- [ ] Update Resend's "Reply-to" default on the domain to
      `lauren@flosmosis.com` if Lauren wants human replies routed.
- [ ] Enable Resend's bounce webhook (see `idempotency-usage.md`
      Supabase-auth pattern — same shape applies).
- [ ] Two weeks after migration: raise DMARC policy from
      `p=quarantine` to `p=reject`.

## Blocked today

- Cannot execute — needs Lauren's Resend and DNS console access.
- Cannot resolve the flosmosis.com DKIM value ahead of time — it's
  generated per-account when Lauren adds the domain in Resend.
- Cannot decide between D.4 Options A vs B without Lauren's preference
  on subdomain-scoped mail policy.
