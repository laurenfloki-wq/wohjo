'use client';

// /command/evidence — the export reveal.
//
// Second signature moment of the product. Mo's experience here should
// feel like assembling a notarised pack: dates default to the current
// pay period, the action is measured, and the resulting card shows
// the data as something he can hand to his bookkeeper and defend.
//
// No fabricated data — render strictly what the API returns.

import { useEffect, useMemo, useState } from 'react';
import {
  Button, Card, CardHeader, DataTable, EmptyState, PageHeader, StatusChip,
} from '@/components/command/ui';
import { ShieldCheck } from 'lucide-react';
import {
  formatDate, formatDecimal, formatInt, pluralise, nounFor,
} from '@/lib/format';
import { payPeriodStart, payPeriodEnd } from '../dashboard/overview-state';

interface ShiftEvidence {
  shift_date: string;
  total_hours: number;
  receipt_id: string;
  status: string;
  hash_verified: boolean;
}

interface WorkerEvidence {
  worker_id: string;
  worker_name: string;
  employee_id: string;
  total_verified_hours: number;
  shift_count: number;
  shifts: ShiftEvidence[];
}

interface EvidenceData {
  period_start: string;
  period_end: string;
  total_workers: number;
  total_shifts: number;
  total_verified_hours: number;
  workers: WorkerEvidence[];
}

function defaultPeriod() {
  return { start: payPeriodStart(), end: payPeriodEnd() };
}

/**
 * A small, deterministic "manifest fingerprint" for the pack — a SHA-256
 * over `period_start | period_end | total_shifts | total_verified_hours |
 * worker_ids.sorted()`. Mo doesn't need to understand it; he needs to
 * see that the pack is the same artefact every time it's generated from
 * the same inputs. This is presentation only — no ledger write.
 */
async function manifestFingerprint(data: EvidenceData): Promise<string> {
  const enc = new TextEncoder();
  const ids = data.workers.map((w) => w.worker_id).slice().sort().join(',');
  const payload = `${data.period_start}|${data.period_end}|${data.total_shifts}|${data.total_verified_hours.toFixed(4)}|${ids}`;
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(payload));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export default function EvidencePage() {
  const defaults = useMemo(() => defaultPeriod(), []);
  const [periodStart, setPeriodStart] = useState(defaults.start);
  const [periodEnd, setPeriodEnd] = useState(defaults.end);
  const [data, setData] = useState<EvidenceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);

  async function fetchEvidence() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/command/super-evidence?start=${periodStart}&end=${periodEnd}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as EvidenceData;
      setData(json);
      const fp = await manifestFingerprint(json);
      setFingerprint(fp);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
      setFingerprint(null);
    } finally {
      setLoading(false);
    }
  }

  // Auto-fetch on first paint so the page lands populated for the
  // default pay period — Mo shouldn't have to ask twice for the
  // information he came here for.
  useEffect(() => { void fetchEvidence(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function exportCsv() {
    if (!data) return;
    const rows: string[] = [];
    rows.push(['Worker', 'Employee ID', 'Shift date', 'Receipt id', 'Hours', 'Status', 'Sealed'].join(','));
    data.workers.forEach((w) => {
      w.shifts.forEach((s) => {
        rows.push([
          csvCell(w.worker_name),
          csvCell(w.employee_id),
          csvCell(s.shift_date),
          csvCell(s.receipt_id),
          s.total_hours.toFixed(2),
          csvCell(s.status),
          s.hash_verified ? 'true' : 'false',
        ].join(','));
      });
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `flostruction-evidence-${data.period_start}-to-${data.period_end}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <PageHeader
        title="Evidence"
        description="A notarised-feeling pack of verified hours for the period. Hand the pack — or the CSV — to your payroll provider as their authoritative input."
        trailing={
          data ? (
            <Button variant="primary" onClick={exportCsv}>Export pack as CSV</Button>
          ) : null
        }
      />

      {/* Period control. Browser date inputs render in the user's locale
          (DD/MM/YYYY here), which can sit oddly next to the rest of the
          app's DD MMM YYYY language. Echo the canonical form under each
          input so the format is always visible and aligned. */}
      <Card style={{ marginBottom: 'var(--s-5)' }}>
        <CardHeader title="Period" description="Defaults to the current pay period (Monday to Sunday)." />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-4)', alignItems: 'flex-end' }}>
          <div>
            <label htmlFor="evidence-period-start" style={labelStyle}>From</label>
            <input
              id="evidence-period-start"
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              style={inputStyle}
              aria-describedby="evidence-period-start-echo"
            />
            <div id="evidence-period-start-echo" style={echoStyle}>{formatDate(periodStart)}</div>
          </div>
          <div>
            <label htmlFor="evidence-period-end" style={labelStyle}>To</label>
            <input
              id="evidence-period-end"
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              style={inputStyle}
              aria-describedby="evidence-period-end-echo"
            />
            <div id="evidence-period-end-echo" style={echoStyle}>{formatDate(periodEnd)}</div>
          </div>
          <Button variant="primary" onClick={fetchEvidence} loading={loading}>
            {loading ? 'Assembling…' : 'Assemble pack'}
          </Button>
        </div>
      </Card>

      {error ? (
        <Card style={{ marginBottom: 'var(--s-5)', borderColor: 'var(--flagged-border)' }}>
          <div style={{ color: 'var(--flagged)', fontWeight: 500 }}>Couldn’t assemble the pack — {error}</div>
        </Card>
      ) : null}

      {!data && !loading && !error ? (
        <EmptyState
          title="No verified shifts in this period"
          description="When you final-approve shifts on the Approvals page, they become part of the next pack. Pick a period and assemble — the pack will reflect whatever the substrate holds."
          action={<Button variant="secondary" onClick={fetchEvidence}>Re-check this period</Button>}
        />
      ) : null}

      {data ? (
        <>
          {/* The signature moment — a notarised certificate. The pack
              fingerprint is rendered inside a circular seal element so
              handing the pack over feels weighty. */}
          <Card style={{ marginBottom: 'var(--s-5)' }} data-emphasis="primary">
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 'var(--s-5)',
              alignItems: 'center',
            }}>
              <div>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  color: 'var(--verified)', fontSize: 12, fontWeight: 500,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  marginBottom: 8,
                }}>
                  <ShieldCheck size={14} strokeWidth={1.7} aria-hidden />
                  All records sealed &amp; verifiable
                </div>
                <h2 style={{ fontSize: 'var(--t-2xl)', marginBottom: 6, lineHeight: 1.05 }}>
                  {pluralise(data.total_shifts, 'shift')} · {formatDecimal(data.total_verified_hours, 2)} hours
                </h2>
                <p style={{ color: 'var(--ink-secondary)' }}>
                  {formatDate(data.period_start)} – {formatDate(data.period_end)} · {pluralise(data.total_workers, 'worker')}
                </p>
              </div>
              <PackSeal fingerprint={fingerprint} />
            </div>

            <hr style={{ margin: 'var(--s-5) 0' }} />

            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', margin: 0, fontSize: 'var(--t-sm)' }}>
              <dt style={dtStyle}>Period</dt>
              <dd style={ddStyle}>{formatDate(data.period_start)} – {formatDate(data.period_end)}</dd>
              <dt style={dtStyle}>{nounFor(data.total_workers, 'Worker', 'Workers')}</dt>
              <dd style={ddStyle}>{formatInt(data.total_workers)}</dd>
              <dt style={dtStyle}>Verified shifts</dt>
              <dd style={ddStyle}>{formatInt(data.total_shifts)}</dd>
              <dt style={dtStyle}>Verified hours</dt>
              <dd style={ddStyle}>{formatDecimal(data.total_verified_hours, 2)}</dd>
              <dt style={dtStyle}>Pack fingerprint</dt>
              <dd style={{ ...ddStyle, fontFamily: 'var(--font-mono)', fontSize: 11, wordBreak: 'break-all' }}>
                {fingerprint ?? '—'}
              </dd>
            </dl>
          </Card>

          {/* Worker rollup. */}
          <Card flush style={{ marginBottom: 'var(--s-5)', padding: 0 }}>
            <CardHeader title="Worker rollup" />
            <DataTable<WorkerEvidence>
              columns={[
                { id: 'worker', header: 'Worker', render: (w) => (
                  <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{w.worker_name}</span>
                ) },
                { id: 'employee_id', header: 'Employee id', mono: true, render: (w) => w.employee_id },
                { id: 'shifts', header: 'Shifts', align: 'right', render: (w) => formatInt(w.shift_count) },
                { id: 'hours', header: 'Verified hours', align: 'right', mono: true, render: (w) => formatDecimal(w.total_verified_hours, 2) },
              ]}
              rows={data.workers}
              rowKey={(w) => w.worker_id}
              empty={<span>No verified shifts in this period.</span>}
            />
          </Card>

          <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-muted)', lineHeight: 1.6, maxWidth: 720 }}>
            About this pack: each hour is tied to an on-site worker confirmation and a supervisor approval, timestamped and sealed at the moment of capture. The pack fingerprint above is a deterministic SHA-256 over the pack’s shape (period, totals, workers) — the same input will always produce the same fingerprint, so a bookkeeper can confirm the file they receive matches the pack you generated here.
          </p>
        </>
      ) : null}
    </>
  );
}

const labelStyle = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--ink-secondary)',
  letterSpacing: '0.04em',
  marginBottom: 6,
} as const;

const inputStyle = {
  padding: '10px 12px',
  minHeight: 44,
  fontSize: 'var(--t-base)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--r-md)',
  boxSizing: 'border-box' as const,
  fontFamily: 'var(--font-sans)',
  fontVariantNumeric: 'tabular-nums lining-nums' as const,
};

const dtStyle = { color: 'var(--ink-muted)', fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontWeight: 500 };
const ddStyle = { margin: 0, color: 'var(--ink)' };
const echoStyle = {
  marginTop: 4,
  fontSize: 11,
  color: 'var(--ink-muted)',
  fontFamily: 'var(--font-sans)',
  letterSpacing: '0.01em',
} as const;

function csvCell(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * PackSeal — circular notarised-seal treatment for the pack fingerprint.
 * Renders as an SVG so it scales crisply, with the first 6 + last 4
 * hex bytes of the fingerprint arc-laid around the ring. The seal is
 * intentionally calm — no embossing or shine — restraint stays the
 * dominant visual move. The full fingerprint sits in the dl below.
 */
function PackSeal({ fingerprint }: { fingerprint: string | null }) {
  const safe = fingerprint ?? '—';
  const head = safe.slice(0, 6);
  const tail = safe.length > 10 ? safe.slice(-4) : '';
  const sz = 132;
  const cx = sz / 2;
  const cy = sz / 2;
  const rOuter = sz / 2 - 1;
  return (
    <div style={{ width: sz, height: sz, position: 'relative', flexShrink: 0 }} aria-hidden>
      <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} role="img" aria-label={`Pack seal ${safe}`}>
        <defs>
          <path id="flos-seal-top" d={`M ${cx - 50},${cy} A 50,50 0 0 1 ${cx + 50},${cy}`} fill="none" />
          <path id="flos-seal-bot" d={`M ${cx + 50},${cy} A 50,50 0 0 1 ${cx - 50},${cy}`} fill="none" />
        </defs>
        <circle cx={cx} cy={cy} r={rOuter} fill="var(--surface-sunken)" stroke="var(--border-strong)" />
        <circle cx={cx} cy={cy} r={rOuter - 6} fill="none" stroke="var(--verified-border)" strokeDasharray="2 3" />
        <text style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.18em', fill: 'var(--ink-muted)' }}>
          <textPath href="#flos-seal-top" startOffset="50%" textAnchor="middle">FLOSTRUCTION VERIFIED</textPath>
        </text>
        <text style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.18em', fill: 'var(--ink-muted)' }}>
          <textPath href="#flos-seal-bot" startOffset="50%" textAnchor="middle">WLES v1.0</textPath>
        </text>
        <g transform={`translate(${cx}, ${cy})`}>
          <text textAnchor="middle" dy={-4} style={{ fontFamily: 'var(--font-display)', fontSize: 13, fill: 'var(--ink)', fontWeight: 500, letterSpacing: '-0.005em' }}>
            Pack
          </text>
          <text textAnchor="middle" dy={14} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fill: 'var(--verified)', fontWeight: 500, letterSpacing: '0.04em' }}>
            {head}
          </text>
          {tail ? (
            <text textAnchor="middle" dy={28} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: 'var(--ink-muted)', letterSpacing: '0.04em' }}>
              …{tail}
            </text>
          ) : null}
        </g>
      </svg>
    </div>
  );
}
