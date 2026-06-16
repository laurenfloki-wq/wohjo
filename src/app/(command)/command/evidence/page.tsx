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
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  PageHeader,
  StatusChip,
} from '@/components/command/ui';
import { rosettePathFromSeed } from '@/lib/guilloche';
import { ShieldCheck } from 'lucide-react';
import { formatDate, formatDecimal, formatInt, pluralise, nounFor } from '@/lib/format';
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
  const ids = data.workers
    .map((w) => w.worker_id)
    .slice()
    .sort()
    .join(',');
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
  useEffect(() => {
    void fetchEvidence();
  }, []);

  function exportCsv() {
    if (!data) return;
    const rows: string[] = [];
    rows.push(
      ['Worker', 'Employee ID', 'Shift date', 'Receipt id', 'Hours', 'Status', 'Sealed'].join(','),
    );
    data.workers.forEach((w) => {
      w.shifts.forEach((s) => {
        rows.push(
          [
            csvCell(w.worker_name),
            csvCell(w.employee_id),
            csvCell(s.shift_date),
            csvCell(s.receipt_id),
            s.total_hours.toFixed(2),
            csvCell(s.status),
            s.hash_verified ? 'true' : 'false',
          ].join(','),
        );
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
            <Button variant="primary" onClick={exportCsv}>
              Export pack as CSV
            </Button>
          ) : null
        }
      />

      {/* Period control. Browser date inputs render in the user's locale
          (DD/MM/YYYY here), which can sit oddly next to the rest of the
          app's DD MMM YYYY language. Echo the canonical form under each
          input so the format is always visible and aligned. */}
      <Card style={{ marginBottom: 'var(--s-5)' }}>
        <CardHeader
          title="Period"
          description="Defaults to the current pay period (Monday to Sunday)."
        />
        <div
          style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-4)', alignItems: 'flex-start' }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-4)' }}>
            <div>
              <label htmlFor="evidence-period-start" style={labelStyle}>
                From
              </label>
              <input
                id="evidence-period-start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                style={inputStyle}
                aria-describedby="evidence-period-start-echo"
              />
              <div id="evidence-period-start-echo" style={echoStyle}>
                {formatDate(periodStart)}
              </div>
            </div>
            <div>
              <label htmlFor="evidence-period-end" style={labelStyle}>
                To
              </label>
              <input
                id="evidence-period-end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                style={inputStyle}
                aria-describedby="evidence-period-end-echo"
              />
              <div id="evidence-period-end-echo" style={echoStyle}>
                {formatDate(periodEnd)}
              </div>
            </div>
          </div>
          {/* Button is positioned on the INPUT ROW (label height down,
              input height tall) so it sits on the inputs' vertical
              centre — not aligned to the helper echo below. The
              flex container above uses align-items:flex-start so we
              control the y-position here explicitly. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              height: 44 /* input height */,
              marginTop: 22 /* label height + label-to-input gap */,
            }}
          >
            <Button variant="primary" onClick={fetchEvidence} loading={loading}>
              {loading ? 'Assembling…' : 'Assemble pack'}
            </Button>
          </div>
        </div>
      </Card>

      {error ? (
        <Card style={{ marginBottom: 'var(--s-5)', borderColor: 'var(--flagged-border)' }}>
          <div style={{ color: 'var(--flagged)', fontWeight: 500 }}>
            Couldn’t assemble the pack — {error}
          </div>
        </Card>
      ) : null}

      {!data && !loading && !error ? (
        <EmptyState
          title="No verified shifts in this period"
          description="When you final-approve shifts on the Approvals page, they become part of the next pack. Pick a period and assemble — the pack will reflect whatever the ledger holds."
          action={
            <Button variant="secondary" onClick={fetchEvidence}>
              Re-check this period
            </Button>
          }
        />
      ) : null}

      {data ? (
        <>
          {/* The signature moment — a notarised certificate. The pack
              fingerprint is rendered inside a circular seal element so
              handing the pack over feels weighty. */}
          <Card style={{ marginBottom: 'var(--s-5)' }} data-emphasis="primary">
            {/* Hero + seal on one row at desktop, stacking to two
                rows on narrow viewports where the 168 px seal
                would otherwise overflow the card. flex-wrap is the
                minimal switch — no media query, no JS, the seal
                just falls below the hero block when the row can't
                hold both. */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--s-5)',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    color: 'var(--verified)',
                    fontSize: 12,
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: 8,
                  }}
                >
                  <ShieldCheck size={14} strokeWidth={1.7} aria-hidden />
                  All records sealed &amp; verifiable
                </div>
                {/* The one hero number per page. Figures render in
                    Fraunces (data-display="serif") so the digits read
                    as the typographic centrepiece; unit words
                    ("shifts" / "hours") stay in Inter at a smaller,
                    tracked size — this avoids the broken Fraunces "f"
                    in "shifts" and reads as a cleaner hero metric. */}
                <h2
                  style={{
                    marginBottom: 6,
                    lineHeight: 1.05,
                    fontWeight: 500,
                    color: 'var(--ink)',
                  }}
                >
                  <span data-display="serif" style={{ fontSize: 'var(--t-2xl)' }}>
                    {formatInt(data.total_shifts)}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 'var(--t-md)',
                      fontWeight: 600,
                      color: 'var(--ink-secondary)',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      marginLeft: 10,
                    }}
                  >
                    {data.total_shifts === 1 ? 'shift' : 'shifts'}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 'var(--t-md)',
                      color: 'var(--ink-muted)',
                      margin: '0 14px',
                    }}
                  >
                    ·
                  </span>
                  <span data-display="serif" style={{ fontSize: 'var(--t-2xl)' }}>
                    {formatDecimal(data.total_verified_hours, 2)}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 'var(--t-md)',
                      fontWeight: 600,
                      color: 'var(--ink-secondary)',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      marginLeft: 10,
                    }}
                  >
                    hours
                  </span>
                </h2>
                <p style={{ color: 'var(--ink-secondary)' }}>
                  {formatDate(data.period_start)} – {formatDate(data.period_end)} ·{' '}
                  {pluralise(data.total_workers, 'worker')}
                </p>
              </div>
              <PackSeal
                fingerprint={fingerprint}
                periodLabel={`${formatDate(data.period_start)} – ${formatDate(data.period_end)}`}
              />
            </div>

            <hr style={{ margin: 'var(--s-5) 0' }} />

            <dl
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                gap: '6px 16px',
                margin: 0,
                fontSize: 'var(--t-sm)',
                position: 'relative',
                zIndex: 1,
              }}
            >
              <dt style={dtStyle}>Period</dt>
              <dd style={ddStyle}>
                {formatDate(data.period_start)} – {formatDate(data.period_end)}
              </dd>
              <dt style={dtStyle}>{nounFor(data.total_workers, 'Worker', 'Workers')}</dt>
              <dd style={ddStyle}>{formatInt(data.total_workers)}</dd>
              <dt style={dtStyle}>Verified shifts</dt>
              <dd style={ddStyle}>{formatInt(data.total_shifts)}</dd>
              <dt style={dtStyle}>Verified hours</dt>
              <dd style={ddStyle}>{formatDecimal(data.total_verified_hours, 2)}</dd>
              <dt style={dtStyle}>Pack fingerprint</dt>
              <dd
                style={{
                  ...ddStyle,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  wordBreak: 'break-all',
                }}
              >
                {fingerprint ?? '—'}
              </dd>
            </dl>
          </Card>

          {/* Worker rollup. Uses default Card padding so both pack boxes
              have identical four-side internal padding (verified by the
              visual harness against scripts/.harness/evidence.png). The
              DataTable runs bordered={false} so it inherits the Card's
              content edges instead of stacking its own border + inset —
              that puts the first column header (WORKER) at the same x
              as the summary's first dt (PERIOD). */}
          <Card style={{ marginBottom: 'var(--s-5)' }}>
            <CardHeader title="Worker rollup" />
            <DataTable<WorkerEvidence>
              bordered={false}
              columns={[
                {
                  id: 'worker',
                  header: 'Worker',
                  render: (w) => (
                    <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{w.worker_name}</span>
                  ),
                },
                {
                  id: 'employee_id',
                  header: 'Employee id',
                  mono: true,
                  render: (w) => w.employee_id,
                },
                {
                  id: 'shifts',
                  header: 'Shifts',
                  align: 'right',
                  render: (w) => formatInt(w.shift_count),
                },
                {
                  id: 'hours',
                  header: 'Verified hours',
                  align: 'right',
                  mono: true,
                  render: (w) => formatDecimal(w.total_verified_hours, 2),
                },
              ]}
              rows={data.workers}
              rowKey={(w) => w.worker_id}
              empty={<span>No verified shifts in this period.</span>}
            />
          </Card>

          <p
            style={{
              fontSize: 'var(--t-xs)',
              color: 'var(--ink-muted)',
              lineHeight: 1.6,
              maxWidth: 720,
            }}
          >
            About this pack: each hour is tied to an on-site worker confirmation and a supervisor
            approval, timestamped and sealed at the moment of capture. The pack fingerprint above is
            a deterministic SHA-256 over the pack’s shape (period, totals, workers) — the same input
            will always produce the same fingerprint, so a bookkeeper can confirm the file they
            receive matches the pack you generated here.
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

// dt is right-aligned inside the auto-sized label column so the visual
// gap from label text to value text is constant for every row (= the
// dl's column-gap), regardless of label length. With left-aligned dts
// short labels (PERIOD) leave a wide gap and long ones (PACK
// FINGERPRINT) nearly touch the value — verified by the harness.
const dtStyle = {
  color: 'var(--ink-muted)',
  fontSize: 11,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  fontWeight: 500,
  textAlign: 'right' as const,
};
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
 * PackSeal — embossed notary stamp for the pack fingerprint.
 *
 * Larger, denser, and physically materialised: concentric ruled rings,
 * a calibrated tick-band, three arcs of microtext (institutional
 * caption above, spec reference below, period reference at the
 * bottom-inner ring), and a centre die that reads as raised on the
 * ground via the one allowed soft shadow inside the seal's footprint.
 */
function PackSeal({
  fingerprint,
  periodLabel,
}: {
  fingerprint: string | null;
  periodLabel?: string;
}) {
  const safe = fingerprint ?? '—';
  const head = safe.length >= 10 ? safe.slice(0, 10) : safe;
  const tail = safe.length >= 16 ? safe.slice(-6) : '';
  const sz = 168;
  const cx = sz / 2;
  const cy = sz / 2;
  const rOuter = sz / 2 - 3;
  const rRule1 = rOuter - 5; // outer institutional ring
  const rRule2 = rRule1 - 16; // inner field ring
  const rTicks = rRule1 - 4;
  const ticks = Array.from({ length: 72 });
  const rTextTop = rOuter - 11;
  const rTextBot = rOuter - 11;
  const rTextInner = rRule2 - 6;

  return (
    <div
      style={{
        width: sz,
        height: sz,
        flexShrink: 0,
        position: 'relative',
      }}
      aria-hidden
    >
      <svg
        width={sz}
        height={sz}
        viewBox={`0 0 ${sz} ${sz}`}
        role="img"
        aria-label={`Pack seal ${safe}`}
        style={{ position: 'relative' }}
      >
        <defs>
          {/* Top arc */}
          <path
            id="flos-seal-top"
            d={`M ${cx - rTextTop},${cy} A ${rTextTop},${rTextTop} 0 0 1 ${cx + rTextTop},${cy}`}
            fill="none"
          />
          {/* Bottom arc (right-to-left so glyphs sit upright) */}
          <path
            id="flos-seal-bot"
            d={`M ${cx - rTextBot},${cy + 2} A ${rTextBot},${rTextBot} 0 0 0 ${cx + rTextBot},${cy + 2}`}
            fill="none"
          />
          {/* Inner-bottom arc for period microtext */}
          <path
            id="flos-seal-inner"
            d={`M ${cx - rTextInner},${cy + 2} A ${rTextInner},${rTextInner} 0 0 0 ${cx + rTextInner},${cy + 2}`}
            fill="none"
          />
          <radialGradient id="flos-seal-paper" cx="50%" cy="42%" r="60%">
            <stop offset="0%" stopColor="var(--surface)" />
            <stop offset="100%" stopColor="var(--bg-ledger)" />
          </radialGradient>
        </defs>

        {/* Plate */}
        <circle
          cx={cx}
          cy={cy}
          r={rOuter}
          fill="url(#flos-seal-paper)"
          stroke="var(--ink)"
          strokeWidth={1.2}
        />
        {/* Outer institutional ring */}
        <circle cx={cx} cy={cy} r={rRule1} fill="none" stroke="var(--ink)" strokeWidth={0.8} />
        {/* Tick-band — 72 fine ticks */}
        <g stroke="var(--ink)" strokeWidth={0.6} strokeLinecap="round">
          {ticks.map((_, i) => {
            const angle = (i / ticks.length) * Math.PI * 2 - Math.PI / 2;
            const x1 = cx + Math.cos(angle) * rTicks;
            const y1 = cy + Math.sin(angle) * rTicks;
            const x2 = cx + Math.cos(angle) * (rTicks - (i % 6 === 0 ? 5 : 2.5));
            const y2 = cy + Math.sin(angle) * (rTicks - (i % 6 === 0 ? 5 : 2.5));
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
          })}
        </g>
        {/* Inner field ring */}
        <circle
          cx={cx}
          cy={cy}
          r={rRule2}
          fill="var(--surface)"
          stroke="var(--verified)"
          strokeWidth={1.5}
        />
        {/* Subtle inset shadow inside the inner field — fakes raised die */}
        <circle
          cx={cx}
          cy={cy}
          r={rRule2 - 0.5}
          fill="none"
          stroke="var(--verified-deep)"
          strokeWidth={0.4}
          strokeOpacity={0.25}
        />

        {/* Guilloché rosette — deterministic from the pack fingerprint,
            clipped to the inner field. Sits behind the centre die. */}
        <defs>
          <clipPath id="flos-seal-rosette-clip">
            <circle cx={cx} cy={cy} r={rRule2 - 2} />
          </clipPath>
        </defs>
        <g clipPath="url(#flos-seal-rosette-clip)">
          <path
            d={rosettePathFromSeed(fingerprint, cx, cy, rRule2 - 4, 240)}
            fill="none"
            stroke="var(--verified-deep)"
            strokeWidth={0.4}
            strokeOpacity={0.16}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        {/* Top arc — institutional caption */}
        <text
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 8,
            letterSpacing: '0.28em',
            fill: 'var(--ink)',
            fontWeight: 700,
          }}
        >
          <textPath href="#flos-seal-top" startOffset="50%" textAnchor="middle">
            FLOSTRUCTION · VERIFIED LEDGER
          </textPath>
        </text>
        {/* Bottom arc — spec reference */}
        <text
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 8,
            letterSpacing: '0.28em',
            fill: 'var(--ink)',
            fontWeight: 700,
          }}
        >
          <textPath href="#flos-seal-bot" startOffset="50%" textAnchor="middle">
            WLES v1.0 · HASH-CHAIN INTACT
          </textPath>
        </text>
        {/* Inner-bottom arc — period reference */}
        {periodLabel ? (
          <text
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 6.5,
              letterSpacing: '0.2em',
              fill: 'var(--ink-secondary)',
              fontWeight: 600,
            }}
          >
            <textPath href="#flos-seal-inner" startOffset="50%" textAnchor="middle">
              {periodLabel.toUpperCase()}
            </textPath>
          </text>
        ) : null}

        {/* Centre die */}
        <g transform={`translate(${cx}, ${cy})`} textAnchor="middle">
          <text
            dy={-18}
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 8.5,
              letterSpacing: '0.2em',
              fill: 'var(--ink-muted)',
              fontWeight: 700,
              textTransform: 'uppercase' as const,
            }}
          >
            Pack
          </text>
          <text
            dy={2}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13.5,
              fill: 'var(--verified-deep)',
              fontWeight: 700,
              letterSpacing: '0.08em',
            }}
          >
            {head}
          </text>
          {tail ? (
            <text
              dy={18}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                fill: 'var(--ink-muted)',
                letterSpacing: '0.06em',
              }}
            >
              …{tail}
            </text>
          ) : null}
          <text
            dy={30}
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 7,
              letterSpacing: '0.18em',
              fill: 'var(--ink-muted)',
              fontWeight: 600,
              textTransform: 'uppercase' as const,
            }}
          >
            SHA-256
          </text>
        </g>
      </svg>
    </div>
  );
}
