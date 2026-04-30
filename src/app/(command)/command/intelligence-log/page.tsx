'use client';

// Flostruction Command — Intelligence Log
// /command/intelligence-log
// Shows per-shift Flostruction Intelligence analysis: worker, confidence score, flag details.
// Sprint 2 D3 deliverable.

import { useEffect, useState } from 'react';
import CommandNav from '@/components/command/CommandNav';

interface AnomalyFlag {
  ruleId: string;
  severity: string;
  explanation: string;
  action: string;
}

interface IntelligenceEntry {
  shift_id: string;
  receipt_id: string;
  shift_date: string;
  worker_first_name: string;
  worker_last_name: string;
  site_name: string | null;
  total_hours: string;
  status: string;
  confidence_score: number;
  confidence_label: string;
  confidence_colour: 'green' | 'amber' | 'red';
  anomaly_flags: AnomalyFlag[];
  intelligence_status: 'VERIFIED' | 'FLAGGED' | 'PENDING';
  flag_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
}

interface Summary {
  total: number;
  verified: number;
  flagged: number;
  pending: number;
  days_shown: number;
}

export default function IntelligenceLogPage() {
  const [entries, setEntries] = useState<IntelligenceEntry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(7);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [days]);

  function loadData() {
    setLoading(true);
    setError('');
    fetch(`/api/command/intelligence?days=${days}&limit=100`)
      .then(r => r.json())
      .then(json => {
        if (json.error) {
          setError(json.error);
        } else {
          setEntries(json.entries ?? []);
          setSummary(json.summary ?? null);
        }
      })
      .catch(() => setError('Failed to load intelligence log'))
      .finally(() => setLoading(false));
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }

  const confidenceColours: Record<string, { bar: string; text: string; bg: string }> = {
    green: { bar: 'var(--color-green)', text: 'var(--color-green-text)', bg: 'var(--color-green-bg)' },
    amber: { bar: '#D97706', text: '#92400E', bg: '#FEF3C7' },
    red: { bar: '#DC2626', text: '#991B1B', bg: '#FEF2F2' },
  };

  const severityColours: Record<string, { text: string; bg: string }> = {
    HIGH: { text: '#991B1B', bg: '#FEF2F2' },
    MEDIUM: { text: '#92400E', bg: '#FEF3C7' },
    LOW: { text: 'var(--color-text-secondary)', bg: 'var(--color-bg-secondary)' },
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      <CommandNav />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px' }}>

        {/* Page header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 8,
          }}>Command</div>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700,
            color: 'var(--color-text-primary)', margin: 0,
            letterSpacing: '-0.012em', lineHeight: 1.05,
          }}>
            Intelligence
          </h1>
          <p style={{
            fontSize: 14, color: 'var(--color-text-tertiary)', marginTop: 8,
            fontFamily: 'var(--font-sans)', maxWidth: 720, lineHeight: 1.6,
          }}>
            Per-shift analysis results from Flostruction Intelligence. Flags are informational only — they never block a submission.
          </p>
        </div>

        {/* Summary strip */}
        {summary && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 16,
            marginBottom: 28,
          }}>
            <SummaryCard label="Total shifts" value={summary.total} />
            <SummaryCard label="Verified" value={summary.verified} accent="var(--color-green)" />
            <SummaryCard label="Needs review" value={summary.flagged} accent="var(--color-amber)" />
            <SummaryCard label="Pending analysis" value={summary.pending} />
          </div>
        )}

        {/* Filter row */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 18,
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.16em',
            textTransform: 'uppercase', color: 'var(--color-text-secondary)',
          }}>
            Last {days} days
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[7, 14, 30].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                style={{
                  padding: '6px 14px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  border: '1px solid ' + (days === d ? 'var(--color-amber)' : 'var(--color-border-strong)'),
                  borderRadius: 6,
                  background: days === d ? 'var(--color-amber)' : 'transparent',
                  color: days === d ? '#0F0F10' : 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  minHeight: 'auto',
                }}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '14px 16px',
            background: 'rgba(199, 75, 58, 0.12)',
            border: '1px solid rgba(199, 75, 58, 0.35)',
            color: '#F8D7CE',
            borderRadius: 'var(--radius-card)',
            fontSize: 14,
            marginBottom: 16,
            fontFamily: 'var(--font-sans)',
          }}>
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px',
            color: 'var(--color-text-tertiary)',
          }}>
            <div style={{
              width: '28px', height: '28px',
              border: '3px solid var(--color-border)',
              borderTopColor: 'var(--color-green)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              marginRight: '12px',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            Loading...
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && entries.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '60px 32px',
            background: 'var(--color-bg)',
            borderRadius: 'var(--radius-card)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-tertiary)',
          }}>
            No shifts in the last {days} days.
          </div>
        )}

        {/* Intelligence entries */}
        {!loading && entries.map(entry => {
          const isExpanded = expandedId === entry.shift_id;
          const cc = confidenceColours[entry.confidence_colour];

          return (
            <div
              key={entry.shift_id}
              style={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-card)',
                marginBottom: '10px',
                overflow: 'hidden',
              }}
            >
              {/* Row header */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : entry.shift_id)}
                style={{
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  padding: '14px 16px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '12px',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '110px 160px 1fr 100px 90px', gap: '12px', alignItems: 'center' }}>
                  {/* Date */}
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    {formatDate(entry.shift_date)}
                  </span>

                  {/* Worker */}
                  <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                    {entry.worker_first_name} {entry.worker_last_name}
                  </span>

                  {/* Site + Hours */}
                  <span style={{ fontSize: '13px', color: 'var(--color-text-tertiary)' }}>
                    {entry.site_name ? `${entry.site_name} · ` : ''}{entry.total_hours} hrs
                  </span>

                  {/* Confidence score */}
                  <div>
                    <div style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: cc.text,
                      marginBottom: '3px',
                    }}>
                      {entry.confidence_score}/100
                    </div>
                    <div style={{
                      height: '4px',
                      background: 'var(--color-bg-secondary)',
                      borderRadius: '2px',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${entry.confidence_score}%`,
                        background: cc.bar,
                        borderRadius: '2px',
                        transition: 'width 0.3s',
                      }} />
                    </div>
                  </div>

                  {/* Intelligence status badge */}
                  <IntelligenceStatusBadge status={entry.intelligence_status} />
                </div>

                {/* Flag pills + chevron */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {entry.high_count > 0 && (
                    <span style={{
                      fontSize: '11px', fontWeight: 700,
                      padding: '2px 7px', borderRadius: '100px',
                      background: '#FEF2F2', color: '#991B1B',
                    }}>
                      {entry.high_count} HIGH
                    </span>
                  )}
                  {entry.medium_count > 0 && (
                    <span style={{
                      fontSize: '11px', fontWeight: 700,
                      padding: '2px 7px', borderRadius: '100px',
                      background: '#FEF3C7', color: '#92400E',
                    }}>
                      {entry.medium_count} MED
                    </span>
                  )}
                  {entry.low_count > 0 && (
                    <span style={{
                      fontSize: '11px', fontWeight: 700,
                      padding: '2px 7px', borderRadius: '100px',
                      background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)',
                    }}>
                      {entry.low_count} LOW
                    </span>
                  )}
                  <span style={{
                    fontSize: '14px',
                    color: 'var(--color-text-tertiary)',
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.15s',
                    marginLeft: '4px',
                  }}>
                    ▾
                  </span>
                </div>
              </button>

              {/* Expanded: flag details */}
              {isExpanded && (
                <div style={{
                  borderTop: '1px solid var(--color-border)',
                  padding: '16px',
                  background: 'var(--color-bg-secondary)',
                }}>
                  {/* Receipt + confidence label */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                  }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px',
                      color: 'var(--color-text-tertiary)',
                    }}>
                      {entry.receipt_id}
                    </span>
                    <span style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: '100px',
                      background: cc.bg,
                      color: cc.text,
                    }}>
                      {entry.confidence_label}
                    </span>
                  </div>

                  {entry.anomaly_flags.length === 0 ? (
                    <div style={{
                      padding: '12px 14px',
                      background: 'var(--color-green-bg)',
                      borderRadius: '8px',
                      fontSize: '13px',
                      color: 'var(--color-green-text)',
                      fontWeight: 600,
                    }}>
                      ✓ No anomalies detected. All rules passed.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {entry.anomaly_flags.map((flag, i) => {
                        const sc = severityColours[flag.severity] ?? severityColours.LOW;
                        return (
                          <div
                            key={i}
                            style={{
                              background: sc.bg,
                              borderRadius: '8px',
                              padding: '12px 14px',
                            }}
                          >
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              marginBottom: '6px',
                            }}>
                              <span style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                padding: '2px 7px',
                                borderRadius: '4px',
                                background: sc.text,
                                color: '#fff',
                                fontFamily: 'var(--font-mono)',
                                letterSpacing: '0.05em',
                              }}>
                                {flag.ruleId}
                              </span>
                              <span style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                color: sc.text,
                                letterSpacing: '0.06em',
                              }}>
                                {flag.severity}
                              </span>
                            </div>
                            <div style={{
                              fontSize: '13px',
                              color: sc.text,
                              marginBottom: '6px',
                              lineHeight: '1.4',
                            }}>
                              {flag.explanation}
                            </div>
                            <div style={{
                              fontSize: '12px',
                              color: sc.text,
                              opacity: 0.8,
                              fontStyle: 'italic',
                            }}>
                              → {flag.action}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper components
// ─────────────────────────────────────────────────────────────────────────────
function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div style={{
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-card)',
      padding: '20px 24px',
      boxShadow: 'var(--shadow-card)',
    }}>
      <div style={{
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        color: 'var(--color-text-secondary)',
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        marginBottom: 12,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 36,
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        color: accent ?? 'var(--color-text-primary)',
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
    </div>
  );
}

function IntelligenceStatusBadge({ status }: { status: 'VERIFIED' | 'FLAGGED' | 'PENDING' }) {
  // Canonical mockup states on charcoal: forest=verified, amber=needs review,
  // muted-strong=pending. Status pill pattern matches /command Sweep 2.
  const map = {
    VERIFIED: { text: 'Verified', color: '#E4F1E8', bg: 'rgba(228, 241, 232, 0.12)', dot: 'var(--color-green)' },
    FLAGGED:  { text: 'Review',   color: '#FAEBCF', bg: 'rgba(217, 165, 72, 0.12)',  dot: 'var(--color-amber)' },
    PENDING:  { text: 'Pending',  color: 'var(--color-text-secondary)', bg: 'rgba(245, 242, 234, 0.04)', dot: 'var(--color-text-tertiary)' },
  };
  const b = map[status];
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      fontWeight: 600,
      padding: '4px 10px',
      borderRadius: 100,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      background: b.bg,
      color: b.color,
      whiteSpace: 'nowrap',
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: b.dot, display: 'inline-block',
      }} />
      {b.text}
    </span>
  );
}
