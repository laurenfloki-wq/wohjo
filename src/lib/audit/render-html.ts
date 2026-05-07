// Flostruction Audit — HTML Renderer
// Converts an AuditPack to a self-contained HTML document for download.

import type { AuditPack, AuditShiftSummary } from './types';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Australia/Sydney',
  });
}

function formatTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Australia/Sydney',
  });
}

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Australia/Sydney',
  });
}

function renderShiftRow(shift: AuditShiftSummary): string {
  const chainIcon = shift.hash_chain_valid ? '✓' : '✗';
  const chainClass = shift.hash_chain_valid ? 'pass' : 'fail';

  return `
    <tr>
      <td>${escapeHtml(shift.worker_name)}</td>
      <td>${escapeHtml(shift.worker_employee_id)}</td>
      <td>${escapeHtml(shift.site_name)}</td>
      <td>${formatDate(shift.shift_date)}</td>
      <td>${formatTime(shift.start_time)}</td>
      <td>${formatTime(shift.end_time)}</td>
      <td>${shift.break_minutes}</td>
      <td>${shift.total_hours.toFixed(2)}</td>
      <td><span class="status ${escapeHtml(shift.status.toLowerCase())}">${escapeHtml(shift.status)}</span></td>
      <td><code>${escapeHtml(shift.receipt_id)}</code></td>
      <td>${shift.events.length}</td>
      <td><span class="${chainClass}">${chainIcon}</span></td>
    </tr>`;
}

function renderEventDetails(shift: AuditShiftSummary): string {
  if (shift.events.length === 0) return '';

  const rows = shift.events
    .map(
      (e) => `
      <tr>
        <td>${formatDateTime(e.created_at)}</td>
        <td><span class="event-type">${escapeHtml(e.event_type)}</span></td>
        <td><code class="hash">${escapeHtml(e.event_hash.slice(0, 16))}…</code></td>
        <td><code class="hash">${e.previous_event_hash ? escapeHtml(e.previous_event_hash.slice(0, 16)) + '…' : '(genesis)'}</code></td>
        <td><pre class="event-data">${escapeHtml(JSON.stringify(e.event_data, null, 2))}</pre></td>
      </tr>`
    )
    .join('');

  return `
    <details class="shift-events">
      <summary>${escapeHtml(shift.worker_name)} — ${formatDate(shift.shift_date)} — ${shift.events.length} events</summary>
      <table class="events-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Event Type</th>
            <th>Hash</th>
            <th>Previous Hash</th>
            <th>Event Data</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </details>`;
}

export function renderAuditHtml(pack: AuditPack): string {
  const integrityClass = pack.hash_chain_integrity === 'VERIFIED' ? 'pass' : 'fail';
  const integrityIcon = pack.hash_chain_integrity === 'VERIFIED' ? '✓' : '✗';

  const shiftRows = pack.shifts.map(renderShiftRow).join('');
  const eventDetails = pack.shifts
    .filter((s) => s.events.length > 0)
    .map(renderEventDetails)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Flostruction Audit Pack — ${escapeHtml(pack.period_start)} to ${escapeHtml(pack.period_end)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; background: #f8f9fa; padding: 2rem; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    .tagline { color: #666; font-size: 0.875rem; margin-bottom: 1.5rem; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .summary-card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; }
    .summary-card .label { font-size: 0.75rem; color: #666; text-transform: uppercase; letter-spacing: 0.05em; }
    .summary-card .value { font-size: 1.5rem; font-weight: 700; margin-top: 0.25rem; }
    .pass { color: #16a34a; }
    .fail { color: #dc2626; font-weight: 700; }
    h2 { font-size: 1.125rem; margin: 1.5rem 0 0.75rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; }
    table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 1rem; }
    th { background: #f1f5f9; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.75rem; text-align: left; border-bottom: 2px solid #e2e8f0; }
    td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #f1f5f9; font-size: 0.875rem; }
    tr:hover { background: #f8fafc; }
    code { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.8rem; background: #f1f5f9; padding: 0.125rem 0.375rem; border-radius: 4px; }
    .hash { font-size: 0.7rem; }
    .status { font-size: 0.75rem; padding: 0.125rem 0.5rem; border-radius: 4px; font-weight: 600; }
    .status.payroll_approved { background: #dcfce7; color: #166534; }
    .status.exported { background: #dbeafe; color: #1e40af; }
    .status.submitted { background: #fef9c3; color: #854d0e; }
    .status.supervisor_approved { background: #e0e7ff; color: #3730a3; }
    .event-type { font-size: 0.75rem; font-weight: 600; background: #f1f5f9; padding: 0.125rem 0.5rem; border-radius: 4px; }
    .event-data { font-size: 0.7rem; white-space: pre-wrap; max-width: 300px; overflow-x: auto; margin: 0; background: transparent; padding: 0; }
    .events-table { font-size: 0.8rem; }
    .shift-events { margin-bottom: 0.75rem; }
    .shift-events summary { cursor: pointer; padding: 0.5rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 0.875rem; }
    .shift-events summary:hover { background: #f1f5f9; }
    .footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; font-size: 0.75rem; color: #999; }
    .flostruction-badge { display: inline-block; background: #1a1a1a; color: white; padding: 0.125rem 0.5rem; border-radius: 4px; font-weight: 700; font-size: 0.75rem; }
    @media print { body { padding: 1rem; } .summary-grid { grid-template-columns: repeat(3, 1fr); } }
  </style>
</head>
<body>
  <div class="container">
    <h1><span class="flostruction-badge">Flostruction</span> Audit Pack</h1>
    <p class="tagline">Every hour flows. Every pay right. — Time verification record</p>

    <div class="summary-grid">
      <div class="summary-card">
        <div class="label">Pay Period</div>
        <div class="value">${escapeHtml(pack.period_start)} — ${escapeHtml(pack.period_end)}</div>
      </div>
      <div class="summary-card">
        <div class="label">Total Shifts</div>
        <div class="value">${pack.total_shifts}</div>
      </div>
      <div class="summary-card">
        <div class="label">Total Hours</div>
        <div class="value">${pack.total_hours.toFixed(2)}</div>
      </div>
      <div class="summary-card">
        <div class="label">WLES Events</div>
        <div class="value">${pack.total_events}</div>
      </div>
      <div class="summary-card">
        <div class="label">Hash Chain Integrity</div>
        <div class="value ${integrityClass}">${integrityIcon} ${pack.hash_chain_integrity}</div>
      </div>
      <div class="summary-card">
        <div class="label">Generated</div>
        <div class="value" style="font-size: 0.875rem;">${formatDateTime(pack.generated_at)}</div>
      </div>
    </div>

    ${pack.broken_chains.length > 0 ? `
    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
      <strong style="color: #dc2626;">Hash Chain Integrity Failure</strong>
      <p style="margin-top: 0.5rem; font-size: 0.875rem;">
        ${pack.broken_chains.length} shift(s) have broken hash chains.
        Shift IDs: ${pack.broken_chains.map(id => `<code>${escapeHtml(id)}</code>`).join(', ')}
      </p>
    </div>` : ''}

    <h2>Hash Chain Integrity</h2>
    <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
      <p style="font-size: 0.875rem; margin-bottom: 0.5rem;">
        Every shift event in Flostruction is recorded as an immutable WLES (Workforce Ledger Evidentiary Standard) entry
        with a SHA-256 cryptographic hash. Each event references the hash of the previous event, creating a
        tamper-evident chain. If any event is modified or deleted, the chain breaks.
      </p>
      <p style="font-size: 0.875rem; margin-bottom: 0.5rem;">
        <strong>Chain status:</strong>
        <span class="${integrityClass}" style="font-size: 1rem;">${integrityIcon} ${pack.hash_chain_integrity}</span>
        — ${pack.broken_chains.length === 0
          ? 'All shift event chains verified. No tampering detected.'
          : pack.broken_chains.length + ' chain(s) failed verification.'}
      </p>
      <p style="font-size: 0.75rem; color: #666;">
        This report provides evidence of verified hours. Flostruction is a time verification platform, not a payroll system.
        Pay calculations are the responsibility of your payroll provider.
      </p>
    </div>

    <h2>Shift Summary</h2>
    <table>
      <thead>
        <tr>
          <th>Worker</th>
          <th>EH ID</th>
          <th>Site</th>
          <th>Date</th>
          <th>Start</th>
          <th>End</th>
          <th>Break</th>
          <th>Hours</th>
          <th>Status</th>
          <th>Receipt</th>
          <th>Events</th>
          <th>Chain</th>
        </tr>
      </thead>
      <tbody>
        ${shiftRows}
      </tbody>
    </table>

    ${eventDetails ? `<h2>WLES Event Detail</h2>${eventDetails}` : ''}

    <div class="footer">
      <p>Flostruction Audit Pack — Company ${escapeHtml(pack.company_id)} — Generated ${formatDateTime(pack.generated_at)}</p>
      <p>Flostruction is a time verification platform. This report provides evidence of hours recorded and verified through the WLES event standard with SHA-256 hash chain integrity checks. It is not payroll documentation.</p>
    </div>
  </div>
</body>
</html>`;
}
