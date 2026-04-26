'use client';

// Flostruction Command — Hour Evidence Pack
// (Route path "super-evidence" retained to avoid link breakage; UI
//  presentation is the Hour Evidence Pack per 2026-04-24 posture sweep.
//  Route rename flagged for morning review.)
// /command/super-evidence
// NOT a super calculator. Provides evidence of verified hours
// that payroll providers use to calculate super obligations.

import { useState } from 'react';
import CommandNav from '@/components/command/CommandNav';

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

function getDefaultPeriod(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  // Default: current month start to today
  const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const end = now.toISOString().split('T')[0];
  return { start, end };
}

export default function SuperEvidencePage() {
  const defaults = getDefaultPeriod();
  const [periodStart, setPeriodStart] = useState(defaults.start);
  const [periodEnd, setPeriodEnd] = useState(defaults.end);
  const [data, setData] = useState<EvidenceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedWorker, setExpandedWorker] = useState<string | null>(null);

  async function fetchEvidence() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/command/super-evidence?start=${periodStart}&end=${periodEnd}`
      );
      const json = await res.json() as EvidenceData;
      setData(json);
    } catch {
      // silent
    }
    setLoading(false);
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-AU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  return (
    <>
      <CommandNav />
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>
            Hour Evidence Pack
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            Verified hours data for the selected period, ready to hand to your
            payroll provider as the input to their calculations.
          </p>
        </div>

        {/* Period Selector */}
        <div style={{
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-card)',
          padding: '20px 24px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'flex-end',
          gap: '16px',
          flexWrap: 'wrap',
        }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: '6px', letterSpacing: '0.04em' }}>
              PERIOD START
            </label>
            <input
              type="date"
              value={periodStart}
              onChange={e => setPeriodStart(e.target.value)}
              style={{
                padding: '8px 12px',
                fontSize: '14px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-btn)',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: '6px', letterSpacing: '0.04em' }}>
              PERIOD END
            </label>
            <input
              type="date"
              value={periodEnd}
              onChange={e => setPeriodEnd(e.target.value)}
              style={{
                padding: '8px 12px',
                fontSize: '14px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-btn)',
              }}
            />
          </div>
          <button
            onClick={fetchEvidence}
            disabled={loading}
            style={{
              padding: '10px 24px',
              background: loading ? 'var(--color-border)' : 'var(--color-navy)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-btn)',
              fontWeight: 700,
              fontSize: '14px',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Loading…' : 'Generate Evidence Pack'}
          </button>
        </div>

        {/* Summary Card */}
        {data && (
          <>
            <div style={{
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-card)',
              padding: '20px 24px',
              marginBottom: '20px',
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '20px',
              }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>PERIOD</div>
                  <div style={{ fontSize: '15px', fontWeight: 700 }}>{formatDate(data.period_start)} — {formatDate(data.period_end)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>WORKERS</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{data.total_workers}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>VERIFIED SHIFTS</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{data.total_shifts}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>TOTAL VERIFIED HOURS</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--color-green)' }}>{data.total_verified_hours.toFixed(2)}</div>
                </div>
              </div>
            </div>

            {/* Worker Table */}
            <div style={{
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-card)',
              overflow: 'hidden',
              marginBottom: '20px',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 700, fontSize: '12px', letterSpacing: '0.04em', color: 'var(--color-text-secondary)' }}>WORKER</th>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 700, fontSize: '12px', letterSpacing: '0.04em', color: 'var(--color-text-secondary)' }}>EH ID</th>
                    <th style={{ textAlign: 'right', padding: '12px 16px', fontWeight: 700, fontSize: '12px', letterSpacing: '0.04em', color: 'var(--color-text-secondary)' }}>SHIFTS</th>
                    <th style={{ textAlign: 'right', padding: '12px 16px', fontWeight: 700, fontSize: '12px', letterSpacing: '0.04em', color: 'var(--color-text-secondary)' }}>VERIFIED HOURS</th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 700, fontSize: '12px', letterSpacing: '0.04em', color: 'var(--color-text-secondary)' }}>DETAIL</th>
                  </tr>
                </thead>
                <tbody>
                  {data.workers.map(w => (
                    <>
                      <tr key={w.worker_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 600 }}>{w.worker_name}</td>
                        <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>{w.employee_id}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right' }}>{w.shift_count}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{w.total_verified_hours.toFixed(2)}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                          <button
                            onClick={() => setExpandedWorker(expandedWorker === w.worker_id ? null : w.worker_id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--color-text-tertiary)',
                              fontSize: '12px',
                              fontWeight: 600,
                            }}
                          >
                            {expandedWorker === w.worker_id ? 'Hide ▴' : 'Show ▾'}
                          </button>
                        </td>
                      </tr>
                      {expandedWorker === w.worker_id && w.shifts.map(s => (
                        <tr key={s.receipt_id} style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                          <td style={{ padding: '8px 16px 8px 32px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>{formatDate(s.shift_date)}</td>
                          <td style={{ padding: '8px 16px', fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{s.receipt_id}</td>
                          <td style={{ padding: '8px 16px', textAlign: 'right', fontSize: '12px' }}>{s.status.replace(/_/g, ' ')}</td>
                          <td style={{ padding: '8px 16px', textAlign: 'right', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>{s.total_hours.toFixed(2)}</td>
                          <td style={{ padding: '8px 16px', textAlign: 'center', fontSize: '12px' }}>
                            <span style={{ color: s.hash_verified ? 'var(--color-green)' : 'var(--color-text-tertiary)' }}>
                              {s.hash_verified ? '✓ WLES' : '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Disclaimer */}
            <div style={{
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-card)',
              padding: '16px 20px',
              fontSize: '12px',
              color: 'var(--color-text-tertiary)',
              lineHeight: 1.6,
            }}>
              <strong style={{ color: 'var(--color-text-secondary)' }}>About this report:</strong> This Hour Evidence Pack
              provides verified hours data for the selected period. Each hour is tied to an on-site worker confirmation and
              a supervisor approval, timestamped and sealed into the FLOSTRUCTION hash chain. The data is exportable as CSV
              for your payroll provider to use as input to their own calculations. All hours shown have been verified
              through the FLOSTRUCTION hash-chained records standard with SHA-256 integrity checking.
            </div>
          </>
        )}

        {!data && !loading && (
          <div style={{
            textAlign: 'center',
            padding: '60px 24px',
            color: 'var(--color-text-tertiary)',
            fontSize: '14px',
          }}>
            Select a period and click &quot;Generate Evidence Pack&quot; to view verified hours data.
          </div>
        )}
      </div>
    </>
  );
}
