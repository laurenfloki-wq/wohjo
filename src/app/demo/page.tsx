// C1 — Public /demo route.
// Renders the Bravo synthetic dataset through the production approvals
// UI pattern so prospects can see WOHJO Command in action without
// signing up or needing any real data.
//
// No auth. No database. No WLES events written. Explicit banner across
// the top declaring the data synthetic.

import type { Metadata } from 'next';
import { getBravoDataset, type DemoShift } from '@/lib/demo/bravo-dataset';

export const metadata: Metadata = {
  title: 'WOHJO Command — live demo (Bravo Labour Hire)',
  description:
    'Interactive demo of WOHJO Command using a synthetic Bravo Labour Hire dataset. No signup required.',
  robots: { index: false }, // don't surface synthetic content in search
};

const PALETTE = {
  navy: '#0E1C2F',
  green: '#166534',
  live: '#4ade80',
  warm: '#F5F0E8',
  muted: '#9CA3AF',
  border: 'rgba(245,240,232,0.14)',
  hi: '#ef4444',
  mid: '#f59e0b',
  lo: '#60a5fa',
};

function StatusChip({ status }: { status: DemoShift['status'] }) {
  const colour = {
    SUBMITTED: PALETTE.lo,
    SUPERVISOR_APPROVED: PALETTE.live,
    PAYROLL_APPROVED: PALETTE.green,
    DISPUTED: PALETTE.hi,
    EDIT_REQUESTED: PALETTE.mid,
    NO_SHOW: PALETTE.hi,
  }[status];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 600,
        color: colour,
        background: `${colour}22`,
        fontFamily: '"IBM Plex Mono", monospace',
        letterSpacing: '0.04em',
      }}
    >
      {status}
    </span>
  );
}

function AnomalyList({ flags }: { flags: DemoShift['anomaly_flags'] }) {
  if (flags.length === 0) return null;
  return (
    <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none' }}>
      {flags.map((f, i) => (
        <li
          key={i}
          style={{
            fontSize: 12,
            color: PALETTE.warm,
            background: f.severity === 'HIGH' ? `${PALETTE.hi}15` : f.severity === 'MEDIUM' ? `${PALETTE.mid}15` : `${PALETTE.lo}15`,
            borderLeft: `3px solid ${f.severity === 'HIGH' ? PALETTE.hi : f.severity === 'MEDIUM' ? PALETTE.mid : PALETTE.lo}`,
            padding: '6px 10px',
            marginBottom: 4,
            borderRadius: 4,
          }}
        >
          <strong style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 11 }}>
            {f.severity} · {f.code}
          </strong>
          <span style={{ marginLeft: 8, color: PALETTE.muted }}>{f.message}</span>
        </li>
      ))}
    </ul>
  );
}

export default function DemoPage() {
  const data = getBravoDataset();

  // Headline metrics
  const totalShifts = data.shifts.length;
  const flagged = data.shifts.filter((s) => s.anomaly_flags.some((f) => f.severity === 'HIGH' || f.severity === 'MEDIUM')).length;
  const approved = data.shifts.filter((s) => s.status === 'PAYROLL_APPROVED').length;
  const totalHours = data.shifts
    .reduce((acc, s) => acc + parseFloat(s.total_hours || '0'), 0)
    .toFixed(0);

  // Only surface the latest day's activity in the demo — that's where
  // the five edge cases live, and keeps the page render fast.
  const latestDate = data.shifts
    .map((s) => s.shift_date)
    .sort()
    .reverse()[0];
  const latest = data.shifts.filter((s) => s.shift_date === latestDate);

  return (
    <main
      style={{
        minHeight: '100vh',
        background: PALETTE.navy,
        color: PALETTE.warm,
        fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
      }}
    >
      {/* Synthetic-data banner */}
      <div
        style={{
          background: '#fef3c7',
          color: '#78350f',
          padding: '10px 24px',
          fontSize: 13,
          fontWeight: 600,
          borderBottom: '1px solid #fde68a',
          fontFamily: '"IBM Plex Mono", monospace',
        }}
      >
        SYNTHETIC DATA — Bravo Labour Hire in this demo is fictional. No real
        worker, shift, site, or company record is shown. Every number is
        generated client-side for illustration only.
      </div>

      <div style={{ padding: '40px 24px 80px', maxWidth: 1100, margin: '0 auto' }}>
        <header style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 12, color: PALETTE.muted, letterSpacing: '0.1em', marginBottom: 4 }}>
            WOHJO COMMAND · LIVE DEMO
          </div>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700 }}>
            {data.company.name}
          </h1>
          <p style={{ color: PALETTE.muted, fontSize: 14, marginTop: 8, maxWidth: 640 }}>
            What the payroll admin sees every morning. Every hour captured by
            the Field app, checked by WOHJO Intelligence, approved by the site
            supervisor, and ready for CSV export.
          </p>
        </header>

        {/* Headline metrics */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 14,
            marginBottom: 36,
          }}
        >
          {[
            { label: 'Shifts', value: totalShifts.toString(), hint: 'Last 6 weeks' },
            { label: 'Flagged by Intelligence', value: flagged.toString(), hint: 'HIGH or MEDIUM' },
            { label: 'Payroll-approved', value: approved.toString(), hint: 'Cleared end-to-end' },
            { label: 'Total hours', value: totalHours, hint: 'Across all shifts' },
          ].map((m) => (
            <div
              key={m.label}
              style={{
                background: 'rgba(245,240,232,0.04)',
                border: `1px solid ${PALETTE.border}`,
                borderRadius: 10,
                padding: '18px 20px',
              }}
            >
              <div style={{ color: PALETTE.muted, fontSize: 12, fontFamily: '"IBM Plex Mono", monospace', letterSpacing: '0.08em' }}>
                {m.label.toUpperCase()}
              </div>
              <div style={{ fontSize: 30, fontWeight: 700, fontFamily: '"IBM Plex Mono", monospace' }}>
                {m.value}
              </div>
              <div style={{ color: PALETTE.muted, fontSize: 11 }}>{m.hint}</div>
            </div>
          ))}
        </section>

        {/* Today's queue */}
        <section>
          <h2 style={{ fontSize: 18, margin: '0 0 12px', fontWeight: 600 }}>
            Today&apos;s approval queue ({latestDate})
          </h2>
          <p style={{ color: PALETTE.muted, fontSize: 13, marginBottom: 16 }}>
            The five rows below demonstrate the edge cases Intelligence is
            built to catch: no-show, GPS failure, duplicate clock, worker edit
            request, and supervisor override. The remaining {latest.length - 5} rows
            are the day&apos;s clean shifts.
          </p>

          <div
            style={{
              background: 'rgba(245,240,232,0.03)',
              border: `1px solid ${PALETTE.border}`,
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '110px 1.2fr 1fr 90px 80px 1.4fr',
                padding: '10px 14px',
                fontSize: 11,
                color: PALETTE.muted,
                fontFamily: '"IBM Plex Mono", monospace',
                letterSpacing: '0.08em',
                borderBottom: `1px solid ${PALETTE.border}`,
              }}
            >
              <div>RECEIPT</div>
              <div>WORKER</div>
              <div>SITE</div>
              <div>HOURS</div>
              <div>CONF</div>
              <div>STATUS / NOTES</div>
            </div>
            {latest.map((s) => (
              <div
                key={s.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '110px 1.2fr 1fr 90px 80px 1.4fr',
                  padding: '14px 14px',
                  borderBottom: `1px solid ${PALETTE.border}`,
                  fontSize: 13,
                  alignItems: 'center',
                  background: s.edge_case !== 'NONE' ? 'rgba(245,240,232,0.04)' : 'transparent',
                }}
              >
                <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 11, color: PALETTE.muted }}>
                  {s.receipt_id}
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>{s.worker_name}</div>
                  {s.worker_note && (
                    <div style={{ fontSize: 12, color: PALETTE.muted, marginTop: 2 }}>
                      &quot;{s.worker_note}&quot;
                    </div>
                  )}
                </div>
                <div style={{ color: PALETTE.muted }}>{s.site_name}</div>
                <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600 }}>
                  {s.total_hours}
                </div>
                <div style={{ fontFamily: '"IBM Plex Mono", monospace', color: s.confidence_score >= 80 ? PALETTE.live : s.confidence_score >= 60 ? PALETTE.mid : PALETTE.hi }}>
                  {s.confidence_score}
                </div>
                <div>
                  <StatusChip status={s.status} />
                  <AnomalyList flags={s.anomaly_flags} />
                  {s.supervisor_note && (
                    <div style={{ fontSize: 12, color: PALETTE.muted, marginTop: 6, fontStyle: 'italic' }}>
                      Supervisor: &quot;{s.supervisor_note}&quot;
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer style={{ marginTop: 48, fontSize: 12, color: PALETTE.muted, fontFamily: '"IBM Plex Mono", monospace' }}>
          Dataset generated at {data.generated_at}. Regenerated each request.{' '}
          <a href="/" style={{ color: PALETTE.muted, textDecoration: 'underline' }}>
            Back to flosmosis.com
          </a>
        </footer>
      </div>
    </main>
  );
}
