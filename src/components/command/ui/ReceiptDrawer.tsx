'use client';

// FLOSTRUCTION /command — ReceiptDrawer.
// Progressive disclosure for a sealed receipt: plain evidence first,
// cryptographic proof one click deeper. Right-edge slide-in, overlay-
// shadowed (the one place the shadow token is permitted).
//
// Reads receipt detail from /api/command/audit-trail?shiftId=... — that
// endpoint already exists; this component only adds the presentation
// shell. Substrate untouched.

import { useEffect, useState } from 'react';
import { X, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDate, formatTime } from '@/lib/format';

interface AuditEntry {
  event_type: string;
  event_data?: Record<string, unknown> | null;
  event_hash?: string | null;
  previous_event_hash?: string | null;
  created_at: string;
  created_by?: string | null;
}

interface Props {
  open: boolean;
  shiftId: string | null;
  receiptId?: string | null;
  workerName?: string | null;
  siteName?: string | null;
  siteTimezone?: string;
  onClose: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  SHIFT_COMMIT: 'Shift committed',
  CLOCK_IN: 'Clock-on',
  CLOCK_OUT: 'Clock-off',
  BREAK_START: 'Break started',
  BREAK_END: 'Break ended',
  SUPERVISOR_APPROVAL: 'Supervisor approval',
  PAYROLL_APPROVAL: 'Payroll approval',
  EXPORT_RECORD: 'Exported to payroll',
  INTELLIGENCE_CLEAR: 'Verified — no issues',
  ANOMALY_FLAG: 'Anomaly flagged',
  SHIFT_END: 'Shift ended',
  SHIFT_START: 'Shift started',
  START_EVENT: 'Shift started',
  END_EVENT: 'Shift ended',
};

export function ReceiptDrawer({
  open, shiftId, receiptId, workerName, siteName, siteTimezone = 'Australia/Sydney', onClose,
}: Props) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !shiftId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/command/audit-trail?shiftId=${encodeURIComponent(shiftId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        if (cancelled) return;
        setEntries(Array.isArray(j?.entries) ? j.entries : []);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [open, shiftId]);

  // Esc to close — also reset proof panel on close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Sealed receipt"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(20,20,20,0.32)',
        display: 'flex', justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 92vw)',
          height: '100%',
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          boxShadow: 'var(--shadow-overlay)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 'var(--s-4) var(--s-5)',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <ShieldCheck size={18} strokeWidth={1.6} color="var(--verified)" aria-hidden />
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em',
                color: 'var(--ink-muted)', fontWeight: 500,
              }}>Sealed receipt</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-sm)', color: 'var(--ink)', wordBreak: 'break-all' }}>
                {receiptId ?? shiftId ?? '—'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent', border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)', padding: '6px 8px',
              color: 'var(--ink-secondary)', cursor: 'pointer',
              minHeight: 36,
            }}
          >
            <X size={16} strokeWidth={1.6} />
          </button>
        </header>

        <div style={{ padding: 'var(--s-5)', overflowY: 'auto', flex: 1 }}>
          <section style={{ marginBottom: 'var(--s-5)' }}>
            <div style={{ color: 'var(--ink-muted)', fontSize: 'var(--t-xs)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              Plain evidence
            </div>
            <div style={{ color: 'var(--ink)', fontSize: 'var(--t-md)', marginBottom: 4 }}>
              {workerName ?? 'Worker'} {siteName ? `· ${siteName}` : ''}
            </div>
            <div style={{ color: 'var(--ink-secondary)', fontSize: 'var(--t-sm)' }}>
              Sealed (WLES v1.0) — every event below is hash-linked to the next.
            </div>
          </section>

          {loading ? (
            <div style={{ color: 'var(--ink-muted)', padding: 'var(--s-5) 0' }}>Loading…</div>
          ) : error ? (
            <div role="alert" style={{
              padding: 'var(--s-3) var(--s-4)',
              background: 'var(--flagged-bg)', border: '1px solid var(--flagged-border)',
              color: 'var(--flagged)', borderRadius: 'var(--r-md)', fontSize: 'var(--t-sm)',
            }}>
              Couldn’t load the timeline — {error}
            </div>
          ) : (
            <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
              {(entries ?? []).map((e, i) => (
                <li key={`${e.event_hash ?? i}`} style={{
                  display: 'grid',
                  gridTemplateColumns: '110px 1fr',
                  gap: 'var(--s-3)',
                  paddingBottom: 'var(--s-3)',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <div>
                    <div style={{ color: 'var(--ink)', fontSize: 'var(--t-sm)' }}>
                      {formatTime(e.created_at, siteTimezone, true)}
                    </div>
                    <div style={{ color: 'var(--ink-muted)', fontSize: 'var(--t-xs)' }}>
                      {formatDate(e.created_at, siteTimezone)}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--ink)', fontSize: 'var(--t-md)', fontWeight: 500 }}>
                      {TYPE_LABELS[e.event_type] ?? e.event_type}
                    </div>
                    {e.created_by ? (
                      <div style={{ color: 'var(--ink-muted)', fontSize: 'var(--t-xs)' }}>
                        {e.created_by}
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
              {(entries?.length ?? 0) === 0 ? (
                <li style={{ color: 'var(--ink-muted)' }}>No events recorded.</li>
              ) : null}
            </ol>
          )}

          <button
            type="button"
            onClick={() => setProofOpen((v) => !v)}
            style={{
              marginTop: 'var(--s-5)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'transparent',
              border: 'none',
              color: 'var(--accent)',
              cursor: 'pointer',
              padding: 0,
              fontSize: 'var(--t-sm)',
              fontWeight: 500,
              minHeight: 36,
            }}
            aria-expanded={proofOpen}
          >
            {proofOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {proofOpen ? 'Hide cryptographic proof' : 'View cryptographic proof'}
          </button>

          {proofOpen ? (
            <div style={{
              marginTop: 'var(--s-3)',
              padding: 'var(--s-3) var(--s-4)',
              background: 'var(--surface-sunken)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
            }}>
              <div style={{ color: 'var(--ink-muted)', fontSize: 'var(--t-xs)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Hash chain (for auditors)
              </div>
              <ol style={{ listStyle: 'decimal', paddingLeft: 'var(--s-4)', margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(entries ?? []).map((e, i) => (
                  <li key={i} style={{ color: 'var(--ink-secondary)', fontSize: 11, fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                    {e.event_hash ?? '—'}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
