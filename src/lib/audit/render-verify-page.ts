// Public verification landing page — what a QR scan opens.
//
// Self-contained HTML (no external assets). A non-technical recipient —
// host-employer finance, an auditor, a Fair Work inspector — scans the
// QR on the Evidence Pack and lands here. The verdict is the result of
// re-running the hash-chain check against the live ledger at request
// time, NOT a claim the document makes about itself.

import type { AuditPack } from './types';
import type { VerifyExportMeta } from './verify-pack';

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Australia/Sydney',
  });
}

function fmtDateTime(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Australia/Sydney',
  });
}

/** The "no record matches this code" page — itself a tamper signal. */
export function renderVerifyNotFound(): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Flostruction — No matching record</title>
<style>
  :root { --ink:#16201b; --paper:#f4f1ea; --line:#dad6cb; --bad:#b42318; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--paper); color: var(--ink); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1.5rem; }
  .card { background: #fff; border: 1px solid var(--line); border-radius: 14px; max-width: 520px; width: 100%; padding: 2.25rem; text-align: center; }
  .mark { display: inline-block; background: var(--ink); color: #fff; font-weight: 800; font-size: 0.7rem; letter-spacing: 0.12em; text-transform: uppercase; padding: 0.2rem 0.55rem; border-radius: 5px; margin-bottom: 1.5rem; }
  .status { font-size: 2rem; font-weight: 800; color: var(--bad); margin-bottom: 0.5rem; }
  p { color: #5a635c; font-size: 0.95rem; line-height: 1.5; }
</style></head>
<body><div class="card">
  <span class="mark">Flostruction</span>
  <div class="status">No matching record</div>
  <p>This verification code does not match any record issued by Flostruction. The document may have been altered, or it was not produced by Flostruction. Do not rely on it as evidence of verified hours.</p>
</div></body></html>`;
}

export function renderVerifyPage(opts: {
  meta: VerifyExportMeta;
  pack: AuditPack;
  url: string;
  qrSvg: string;
}): string {
  const { meta, pack, url, qrSvg } = opts;
  const verified = pack.hash_chain_integrity === 'VERIFIED';
  const accent = verified ? '#1b6e3c' : '#b42318';
  const icon = verified ? '✓' : '✗';
  const headline = verified ? 'Verified' : 'Failed verification';
  const sub = verified
    ? 'These hours were re-checked against the WLES ledger just now. The hash chain is intact — no tampering detected.'
    : 'One or more shift records failed the hash-chain check against the WLES ledger. These hours should be reviewed before they are paid.';

  const rows = pack.shifts
    .map(
      (s) => `
      <tr>
        <td>${esc(s.worker_name)}</td>
        <td>${esc(s.site_name)}</td>
        <td>${fmtDate(s.shift_date)}</td>
        <td class="num">${s.total_hours.toFixed(2)}</td>
        <td><code>${esc(s.receipt_id)}</code></td>
        <td class="chain ${s.hash_chain_valid ? 'ok' : 'bad'}">${s.hash_chain_valid ? '✓' : '✗'}</td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Flostruction — Hours verification</title>
<style>
  :root { --ink:#16201b; --muted:#5a635c; --paper:#f4f1ea; --surface:#fff; --line:#dad6cb; --accent:${accent}; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--paper); color: var(--ink); padding: 1.5rem; }
  .wrap { max-width: 640px; margin: 0 auto; }
  .mark { display: inline-block; background: var(--ink); color: #fff; font-weight: 800; font-size: 0.7rem; letter-spacing: 0.12em; text-transform: uppercase; padding: 0.2rem 0.55rem; border-radius: 5px; }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 1.75rem; margin-top: 1rem; }
  .hero { display: flex; gap: 1.25rem; align-items: center; }
  .badge { flex: none; width: 64px; height: 64px; border-radius: 50%; background: var(--accent); color: #fff; font-size: 2rem; display: flex; align-items: center; justify-content: center; }
  .hero h1 { font-size: 1.5rem; color: var(--accent); }
  .hero p { color: var(--muted); font-size: 0.9rem; margin-top: 0.25rem; line-height: 1.45; }
  .qr { float: right; width: 96px; height: 96px; margin: 0 0 0.5rem 1rem; }
  .qr svg { width: 100%; height: 100%; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-top: 1.5rem; }
  .stat { border: 1px solid var(--line); border-radius: 10px; padding: 0.75rem; }
  .stat .l { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
  .stat .v { font-size: 1.25rem; font-weight: 800; margin-top: 0.15rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 1.5rem; font-size: 0.85rem; }
  th { text-align: left; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--line); }
  td { padding: 0.5rem; border-bottom: 1px solid #efece4; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.chain { text-align: center; font-weight: 700; }
  .chain.ok { color: #1b6e3c; } .chain.bad { color: #b42318; }
  code { font-family: ui-monospace, 'SF Mono', monospace; font-size: 0.78rem; }
  .meta { margin-top: 1.5rem; font-size: 0.75rem; color: var(--muted); line-height: 1.6; word-break: break-all; }
  .meta strong { color: var(--ink); }
  .foot { margin-top: 1.25rem; font-size: 0.72rem; color: var(--muted); line-height: 1.5; }
</style></head>
<body><div class="wrap">
  <span class="mark">Flostruction</span>
  <div class="card">
    <div class="qr">${qrSvg}</div>
    <div class="hero">
      <div class="badge">${icon}</div>
      <div>
        <h1>${headline}</h1>
        <p>${sub}</p>
      </div>
    </div>

    <div class="stats">
      <div class="stat"><div class="l">Pay period</div><div class="v" style="font-size:0.95rem">${esc(fmtDate(meta.payPeriodStart))} — ${esc(fmtDate(meta.payPeriodEnd))}</div></div>
      <div class="stat"><div class="l">Verified hours</div><div class="v">${pack.total_hours.toFixed(2)}</div></div>
      <div class="stat"><div class="l">Shifts</div><div class="v">${pack.total_shifts}</div></div>
    </div>

    <table>
      <thead><tr><th>Worker</th><th>Site</th><th>Date</th><th class="num">Hours</th><th>Receipt</th><th>Chain</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="meta">
      <div><strong>Checked:</strong> ${fmtDateTime(pack.generated_at)} (live against the ledger)</div>
      <div><strong>Provider:</strong> ${esc(meta.provider ?? '—')}</div>
      <div><strong>File hash (SHA-256):</strong> ${esc(meta.fileHash)}</div>
    </div>

    <div class="foot">
      Flostruction is a time-verification platform. Every shift event is recorded as an immutable WLES (Workforce Ledger Evidentiary Standard) entry with a SHA-256 hash that references the previous event, forming a tamper-evident chain. This page re-computed that chain against the ledger when you opened it. Flostruction is not a payroll system; pay calculations are the responsibility of the payroll provider.
    </div>
  </div>
  <p class="foot" style="text-align:center;max-width:640px">${esc(url)}</p>
</div></body></html>`;
}
