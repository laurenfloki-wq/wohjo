'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

// ─── Types ──────────────────────────────────────────────────────────────────
interface AnomalyFlag {
  ruleId: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  explanation: string;
  action: string;
}

interface ShiftRow {
  id: string;
  company_id: string;
  worker_id: string;
  site_id: string;
  shift_date: string;
  start_time: string;
  end_time: string | null;
  break_minutes: number;
  total_hours: string | null;
  receipt_id: string;
  status: string;
  confidence_score: number | null;
  anomaly_flags: AnomalyFlag[] | null;
  worker_note: string | null;
  supervisor_approved_at: string | null;
  workers: { id: string; first_name: string; last_name: string; pay_rate: string } | null;
  sites: { id: string; name: string } | null;
}

interface SupervisorInfo {
  supervisor_id: string;
  company_id: string;
  name: string;
  phone: string;
  site_ids: string[];
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function VerifyClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [supervisor, setSupervisor] = useState<SupervisorInfo | null>(null);
  const [pendingShifts, setPendingShifts] = useState<ShiftRow[]>([]);
  const [approvedToday, setApprovedToday] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [queryingShift, setQueryingShift] = useState<string | null>(null);
  const [expandedFlag, setExpandedFlag] = useState<string | null>(null);
  const [showApproved, setShowApproved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // ── Auth ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) {
      setAuthError(true);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/verify/auth?token=${token}`);
        if (!res.ok) { setAuthError(true); setLoading(false); return; }
        const data = await res.json();
        setSupervisor(data);
      } catch {
        setAuthError(true);
      }
      setLoading(false);
    })();
  }, [token]);

  // ── Fetch shifts ────────────────────────────────────────────────────────
  // Day-7 P2 (2026-04-24) companion commit: pass the URL `token` on the
  // shifts query so the server re-validates it per request. supervisor_id
  // is derived server-side from the token row and is no longer part of
  // the client→server contract.
  const fetchShifts = useCallback(async () => {
    if (!supervisor || !token) return;
    try {
      const [pendingRes, approvedRes] = await Promise.all([
        fetch(`/api/verify/shifts?token=${encodeURIComponent(token)}&status=SUBMITTED`),
        fetch(`/api/verify/shifts?token=${encodeURIComponent(token)}&status=SUPERVISOR_APPROVED`),
      ]);
      const pendingData = await pendingRes.json();
      const approvedData = await approvedRes.json();
      setPendingShifts(pendingData.shifts ?? []);
      setApprovedToday(approvedData.shifts ?? []);
    } catch {
      // silent
    }
  }, [supervisor, token]);

  useEffect(() => { if (supervisor) fetchShifts(); }, [supervisor, fetchShifts]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  // ── Approve ─────────────────────────────────────────────────────────────
  // Day-7 P2 companion: body now carries `verify_token` (from URL);
  // server derives supervisor_id + phone from the matched token row.
  // `supervisor_phone` retained in body for audit/display purposes only
  // (the server logs it but doesn't trust it for identity).
  const handleApprove = async (shiftId: string) => {
    if (!supervisor || !token) return;
    const res = await fetch(`/api/verify/approve/${shiftId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        verify_token: token,
        supervisor_phone: supervisor.phone,
      }),
    });
    if (res.ok) {
      showToast('Shift approved');
      fetchShifts();
    }
  };

  // ── Bulk Approve (clean shifts only) ────────────────────────────────────
  const cleanShifts = pendingShifts.filter(s => {
    const flags = (s.anomaly_flags ?? []) as AnomalyFlag[];
    return !flags.some(f => f.severity === 'HIGH' || f.severity === 'MEDIUM');
  });

  const handleBulkApprove = async () => {
    if (!token) return;
    if (!confirm(`Approve all ${cleanShifts.length} clean shifts?`)) return;
    for (const shift of cleanShifts) {
      await fetch(`/api/verify/approve/${shift.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verify_token: token,
          supervisor_phone: supervisor?.phone,
        }),
      });
    }
    showToast(`${cleanShifts.length} clean shifts approved`);
    fetchShifts();
  };

  // ── Query/Dispute ───────────────────────────────────────────────────────
  const handleQuery = async (shiftId: string, reason: string) => {
    if (!supervisor || !token) return;
    const res = await fetch(`/api/verify/dispute/${shiftId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        verify_token: token,
        supervisor_phone: supervisor.phone,
        reason,
      }),
    });
    if (res.ok) {
      showToast('Queued for review');
      setQueryingShift(null);
      fetchShifts();
    }
  };

  // ── Helpers ─────────────────────────────────────────────────────────────
  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('en-AU', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Sydney',
  });
  const timeAgo = (iso: string) => {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
    return `${Math.round(mins / 1440)}d ago`;
  };

  // ── Auth Error ──────────────────────────────────────────────────────────
  if (authError) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-bg-secondary)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Flostruction Verify</div>
          <p style={{ fontSize: '14px', color: '#666' }}>Invalid or expired link. Please use the link from your latest SMS.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-bg-secondary)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ fontSize: '14px', color: '#666' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg-secondary)' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
          background: 'var(--color-green)', color: '#fff', padding: '12px 24px',
          borderRadius: '8px', fontWeight: 600, fontSize: '14px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{
        background: 'var(--color-charcoal)', padding: '16px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: '16px', fontFamily: 'monospace' }}>
            Flostruction Verify
          </div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>
            {supervisor?.name}
          </div>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', textAlign: 'right' }}>
          {pendingShifts.length} pending &middot; {approvedToday.length} approved today
        </div>
      </div>

      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '16px' }}>
        {/* Bulk Approve */}
        {cleanShifts.length >= 2 && (
          <button
            onClick={handleBulkApprove}
            style={{
              width: '100%', padding: '14px', background: 'var(--color-green)', color: '#fff',
              border: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '15px',
              cursor: 'pointer', marginBottom: '16px',
            }}
          >
            Approve {cleanShifts.length} clean shifts
          </button>
        )}

        {/* Pending Shifts */}
        {pendingShifts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#666' }}>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>All clear</div>
            <div style={{ fontSize: '13px' }}>No pending timesheets to review</div>
          </div>
        ) : (
          pendingShifts.map(shift => {
            const worker = shift.workers;
            const site = shift.sites;
            const hours = parseFloat(shift.total_hours ?? '0');
            const payRate = parseFloat(worker?.pay_rate ?? '0');
            const estPay = (hours * payRate).toFixed(2);
            const flags = (shift.anomaly_flags ?? []) as AnomalyFlag[];
            const hasHighMed = flags.some(f => f.severity === 'HIGH' || f.severity === 'MEDIUM');

            return (
              <div key={shift.id} style={{
                background: '#fff', borderRadius: '12px', padding: '16px',
                marginBottom: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                transition: 'transform 0.2s, opacity 0.2s',
              }}>
                {/* Worker name */}
                <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--color-charcoal)', marginBottom: '6px' }}>
                  {worker?.first_name} {worker?.last_name}
                </div>

                {/* Details */}
                <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>
                  {site?.name} &middot; {shift.shift_date} &middot; {shift.start_time ? formatTime(shift.start_time) : '—'} → {shift.end_time ? formatTime(shift.end_time) : '—'} &middot; {hours.toFixed(1)} hrs &middot; Est. ${estPay}
                </div>

                {/* Worker note (G2/G3 Tier 1 — surfaced 2026-04-30 evening). */}
                {shift.worker_note && shift.worker_note.trim().length > 0 && (
                  <div
                    style={{
                      borderLeft: '3px solid var(--color-charcoal, #0E1C2F)',
                      paddingLeft: '10px',
                      margin: '4px 0 12px',
                      fontSize: '13px',
                      lineHeight: 1.45,
                      color: 'var(--color-charcoal, #0E1C2F)',
                      fontStyle: 'italic',
                    }}
                  >
                    <div
                      style={{
                        fontStyle: 'normal',
                        fontSize: '11px',
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: '#666',
                        marginBottom: '3px',
                      }}
                    >
                      {worker?.first_name ?? 'Worker'} added
                    </div>
                    &ldquo;{shift.worker_note.trim()}&rdquo;
                  </div>
                )}

                {/* Intelligence Status Pill */}
                {!hasHighMed ? (
                  <div style={{
                    display: 'inline-block', padding: '4px 12px', borderRadius: '12px',
                    background: 'var(--color-green-bg)', color: 'var(--color-green)', fontSize: '12px', fontWeight: 600,
                    marginBottom: '12px',
                  }}>
                    Flostruction Verified — no issues
                  </div>
                ) : (
                  <div>
                    {flags.filter(f => f.severity === 'HIGH' || f.severity === 'MEDIUM').map((f, i) => (
                      <div key={i} style={{ marginBottom: '4px' }}>
                        <button
                          onClick={() => setExpandedFlag(expandedFlag === `${shift.id}-${i}` ? null : `${shift.id}-${i}`)}
                          style={{
                            display: 'inline-block', padding: '4px 12px', borderRadius: '12px',
                            background: 'var(--color-amber-bg)', color: 'var(--color-amber-text)', fontSize: '12px', fontWeight: 600,
                            border: 'none', cursor: 'pointer', marginBottom: '4px',
                          }}
                        >
                          {f.explanation.split('.')[0]} {expandedFlag === `${shift.id}-${i}` ? '▴' : '▾'}
                        </button>
                        {expandedFlag === `${shift.id}-${i}` && (
                          <div style={{ fontSize: '12px', color: '#666', padding: '4px 12px' }}>
                            {f.explanation}. {f.action}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Buttons */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button
                    onClick={() => handleApprove(shift.id)}
                    style={{
                      flex: 1, padding: '14px', background: 'var(--color-green)', color: '#fff',
                      border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '15px',
                      cursor: 'pointer', minHeight: '56px',
                    }}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setQueryingShift(queryingShift === shift.id ? null : shift.id)}
                    style={{
                      flex: 1, padding: '14px', background: '#fff', color: 'var(--color-charcoal)',
                      border: '1px solid #ddd', borderRadius: '10px', fontWeight: 600, fontSize: '15px',
                      cursor: 'pointer', minHeight: '56px',
                    }}
                  >
                    Query
                  </button>
                </div>

                {/* Query Form */}
                {queryingShift === shift.id && (
                  <QueryForm
                    onSubmit={(reason) => handleQuery(shift.id, reason)}
                    onCancel={() => setQueryingShift(null)}
                  />
                )}
              </div>
            );
          })
        )}

        {/* Approved Today Section */}
        {approvedToday.length > 0 && (
          <div style={{ marginTop: '24px' }}>
            <button
              onClick={() => setShowApproved(!showApproved)}
              style={{
                width: '100%', padding: '12px', background: '#fff', border: '1px solid #ddd',
                borderRadius: '12px', fontWeight: 600, fontSize: '14px', cursor: 'pointer',
                color: '#666',
              }}
            >
              {showApproved ? 'Hide' : 'Show'} approved today ({approvedToday.length})
            </button>
            {showApproved && (
              <div style={{ marginTop: '8px' }}>
                {approvedToday.map(shift => (
                  <div key={shift.id} style={{
                    background: '#fff', borderRadius: '10px', padding: '12px 16px',
                    marginBottom: '8px', opacity: 0.7,
                  }}>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>
                      {shift.workers?.first_name} {shift.workers?.last_name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      {shift.sites?.name} &middot; {parseFloat(shift.total_hours ?? '0').toFixed(1)} hrs &middot;
                      Approved {shift.supervisor_approved_at ? timeAgo(shift.supervisor_approved_at) : ''} via Flostruction Verify
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Query Form ─────────────────────────────────────────────────────────────
function QueryForm({ onSubmit, onCancel }: {
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <div style={{ marginTop: '8px' }}>
      <textarea
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="What's the issue?"
        style={{
          width: '100%', padding: '10px', fontSize: '14px', borderRadius: '8px',
          border: '1px solid #ddd', minHeight: '60px', boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <button
          onClick={() => reason && onSubmit(reason)}
          disabled={!reason}
          style={{
            flex: 1, padding: '10px', background: 'var(--color-warm-red)', color: '#fff',
            border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '14px',
            cursor: reason ? 'pointer' : 'not-allowed', opacity: reason ? 1 : 0.5,
          }}
        >
          Submit Query
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '10px 16px', background: '#fff', border: '1px solid #ddd',
            borderRadius: '8px', fontSize: '14px', cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
