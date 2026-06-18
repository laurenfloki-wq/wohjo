'use client';

// Supervisor verify — the approval surface an external site manager lands on
// from the SMS link. Mobile-first, on-brand, one tap to approve. It carries a
// short-lived action token (replayed on approve/dispute) and ends in the
// trust + "what is this?" moment that makes a non-customer manager a warm lead.

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

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
  action_token: string | null;
}

const C = {
  bg: '#f4f1e8',
  paper: '#fbf8f1',
  ink: '#1f1b14',
  ink50: '#6e6657',
  ink35: '#8a8068',
  rule: '#e5decd',
  rule2: '#d7cfba',
  forest: '#1e7a40',
  forestDeep: '#166534',
  forestBg: '#e8f0e6',
  navy: '#0e1c2f',
  amber: '#d9a548',
  amberInk: '#8a6116',
  amberBg: '#f6ecd6',
  red: '#b5402f',
  redBg: '#f8e7e2',
  serif: 'Georgia, "Times New Roman", serif',
};

export default function VerifyClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [supervisor, setSupervisor] = useState<SupervisorInfo | null>(null);
  const [actionToken, setActionToken] = useState<string | null>(null);
  const [pendingShifts, setPendingShifts] = useState<ShiftRow[]>([]);
  const [approvedToday, setApprovedToday] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [queryingShift, setQueryingShift] = useState<string | null>(null);
  const [expandedFlag, setExpandedFlag] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showApproved, setShowApproved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const authenticate = useCallback(async (): Promise<SupervisorInfo | null> => {
    if (!token) {
      setAuthError(true);
      setLoading(false);
      return null;
    }
    try {
      const res = await fetch(`/api/verify/auth?token=${encodeURIComponent(token)}`);
      if (!res.ok) {
        setAuthError(true);
        setLoading(false);
        return null;
      }
      const data = (await res.json()) as SupervisorInfo;
      setSupervisor(data);
      setActionToken(data.action_token ?? null);
      setLoading(false);
      return data;
    } catch {
      setAuthError(true);
      setLoading(false);
      return null;
    }
  }, [token]);

  useEffect(() => {
    void authenticate();
  }, [authenticate]);

  const fetchShifts = useCallback(async () => {
    if (!token) return;
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
  }, [token]);

  useEffect(() => {
    if (supervisor) void fetchShifts();
  }, [supervisor, fetchShifts]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  // POST with the short-lived action token replayed; on an expired session,
  // re-mint once and retry so the supervisor never sees friction.
  const postAction = useCallback(
    async (url: string, body: Record<string, unknown>, retried = false): Promise<boolean> => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(actionToken ? { 'x-verify-action': actionToken } : {}),
        },
        body: JSON.stringify(body),
      });
      if (res.ok) return true;
      if (res.status === 401 && !retried) {
        const data = (await res.json().catch(() => ({}))) as { code?: string };
        if (data.code === 'ACTION_TOKEN') {
          const fresh = await authenticate();
          if (fresh?.action_token) {
            const res2 = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-verify-action': fresh.action_token },
              body: JSON.stringify(body),
            });
            return res2.ok;
          }
        }
      }
      return false;
    },
    [actionToken, authenticate],
  );

  const cleanShifts = pendingShifts.filter((s) => {
    const flags = (s.anomaly_flags ?? []) as AnomalyFlag[];
    return !flags.some((f) => f.severity === 'HIGH' || f.severity === 'MEDIUM');
  });

  const handleApprove = async (shiftId: string) => {
    if (!supervisor || !token || busy) return;
    setBusy(shiftId);
    const ok = await postAction(`/api/verify/approve/${shiftId}`, {
      verify_token: token,
      supervisor_phone: supervisor.phone,
    });
    setBusy(null);
    if (ok) {
      showToast('Approved — sealed for pay');
      void fetchShifts();
    } else {
      showToast('Could not approve. Try again.');
    }
  };

  const handleBulkApprove = async () => {
    if (!token || !supervisor || busy) return;
    setBusy('bulk');
    let done = 0;
    for (const shift of cleanShifts) {
      const ok = await postAction(`/api/verify/approve/${shift.id}`, {
        verify_token: token,
        supervisor_phone: supervisor.phone,
      });
      if (ok) done++;
    }
    setBusy(null);
    showToast(`${done} ${done === 1 ? 'shift' : 'shifts'} approved`);
    void fetchShifts();
  };

  const handleQuery = async (shiftId: string, reason: string) => {
    if (!supervisor || !token || busy) return;
    setBusy(shiftId);
    const ok = await postAction(`/api/verify/dispute/${shiftId}`, {
      verify_token: token,
      supervisor_phone: supervisor.phone,
      reason,
    });
    setBusy(null);
    if (ok) {
      showToast('Sent back to the office');
      setQueryingShift(null);
      void fetchShifts();
    } else {
      showToast('Could not send. Try again.');
    }
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-AU', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Australia/Sydney',
    });
  const formatDay = (d: string) =>
    new Date(d).toLocaleDateString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'Australia/Sydney',
    });
  const timeAgo = (iso: string) => {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
    return `${Math.round(mins / 1440)}d ago`;
  };
  const firstName = (supervisor?.name ?? '').trim().split(/\s+/)[0] || 'there';

  if (authError) {
    return (
      <Shell>
        <div style={{ textAlign: 'center', padding: '64px 24px' }}>
          <Wordmark />
          <p style={{ fontSize: 15, color: C.ink50, marginTop: 16, lineHeight: 1.5 }}>
            This link has expired. Open the most recent link from your FLOSTRUCTION SMS.
          </p>
        </div>
      </Shell>
    );
  }

  if (loading) {
    return (
      <Shell>
        <div style={{ textAlign: 'center', padding: '64px 24px', color: C.ink50, fontSize: 14 }}>
          Loading…
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            background: C.navy,
            color: '#fff',
            padding: '11px 22px',
            borderRadius: 10,
            fontWeight: 500,
            fontSize: 14,
            boxShadow: '0 6px 20px rgba(14,28,47,0.25)',
          }}
        >
          {toast}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '18px 20px 6px',
          maxWidth: 600,
          margin: '0 auto',
        }}
      >
        <Wordmark />
        <span style={{ fontSize: 12.5, color: C.ink35, fontFamily: 'ui-monospace, monospace' }}>
          {pendingShifts.length} pending · {approvedToday.length} done
        </span>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '8px 16px 40px' }}>
        <div style={{ padding: '10px 4px 18px' }}>
          <h1 style={{ font: `400 24px/1.25 ${C.serif}`, color: C.ink, margin: 0 }}>
            G&rsquo;day {firstName}.
          </h1>
          <p style={{ fontSize: 15, color: C.ink50, margin: '6px 0 0', lineHeight: 1.5 }}>
            {pendingShifts.length === 0
              ? 'Nothing needs your OK right now — you&rsquo;re all clear.'
              : `${pendingShifts.length} ${pendingShifts.length === 1 ? 'shift' : 'shifts'} from your crew ${pendingShifts.length === 1 ? 'needs' : 'need'} your OK for pay.`}
          </p>
        </div>

        {cleanShifts.length >= 2 && (
          <button
            onClick={handleBulkApprove}
            disabled={busy !== null}
            style={{
              width: '100%',
              padding: 15,
              background: C.forest,
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              fontWeight: 500,
              fontSize: 15.5,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.6 : 1,
              marginBottom: 16,
            }}
          >
            {busy === 'bulk' ? 'Approving…' : `Approve all ${cleanShifts.length} clean shifts`}
          </button>
        )}

        {pendingShifts.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '32px 20px',
              color: C.ink50,
              background: C.paper,
              border: `1px solid ${C.rule}`,
              borderRadius: 14,
            }}
          >
            <div style={{ font: `400 17px/1.3 ${C.serif}`, color: C.ink, marginBottom: 4 }}>
              All clear
            </div>
            <div style={{ fontSize: 13.5 }}>Every timesheet from your crew is handled.</div>
          </div>
        ) : (
          pendingShifts.map((shift) => {
            const worker = shift.workers;
            const site = shift.sites;
            const hours = parseFloat(shift.total_hours ?? '0');
            const payRate = parseFloat(worker?.pay_rate ?? '0');
            const estPay = (hours * payRate).toFixed(2);
            const flags = (shift.anomaly_flags ?? []) as AnomalyFlag[];
            const hasHighMed = flags.some((f) => f.severity === 'HIGH' || f.severity === 'MEDIUM');
            const isBusy = busy === shift.id;

            return (
              <div
                key={shift.id}
                style={{
                  background: C.paper,
                  borderRadius: 14,
                  padding: 16,
                  marginBottom: 12,
                  border: `1px solid ${C.rule}`,
                }}
              >
                <div style={{ font: `400 18px/1.2 ${C.serif}`, color: C.ink, marginBottom: 5 }}>
                  {worker?.first_name} {worker?.last_name}
                </div>
                <div style={{ fontSize: 13, color: C.ink50, marginBottom: 10 }}>
                  {site?.name} · {formatDay(shift.shift_date)} ·{' '}
                  {shift.start_time ? formatTime(shift.start_time) : '—'}–
                  {shift.end_time ? formatTime(shift.end_time) : '—'} · {hours.toFixed(1)} hrs · est. $
                  {estPay}
                </div>

                {shift.worker_note && shift.worker_note.trim().length > 0 && (
                  <div
                    style={{
                      borderLeft: `3px solid ${C.rule2}`,
                      paddingLeft: 10,
                      margin: '4px 0 12px',
                      fontSize: 13,
                      lineHeight: 1.45,
                      color: C.ink,
                      fontStyle: 'italic',
                    }}
                  >
                    <div
                      style={{
                        fontStyle: 'normal',
                        fontSize: 10.5,
                        fontWeight: 600,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: C.ink35,
                        marginBottom: 3,
                      }}
                    >
                      {worker?.first_name ?? 'Worker'} added
                    </div>
                    &ldquo;{shift.worker_note.trim()}&rdquo;
                  </div>
                )}

                {!hasHighMed ? (
                  <div
                    style={{
                      display: 'inline-block',
                      padding: '4px 11px',
                      borderRadius: 8,
                      background: C.forestBg,
                      color: C.forestDeep,
                      fontSize: 12,
                      fontWeight: 500,
                      marginBottom: 12,
                    }}
                  >
                    Verified — no issues found
                  </div>
                ) : (
                  <div style={{ marginBottom: 8 }}>
                    {flags
                      .filter((f) => f.severity === 'HIGH' || f.severity === 'MEDIUM')
                      .map((f, i) => (
                        <div key={i} style={{ marginBottom: 4 }}>
                          <button
                            onClick={() =>
                              setExpandedFlag(
                                expandedFlag === `${shift.id}-${i}` ? null : `${shift.id}-${i}`,
                              )
                            }
                            style={{
                              display: 'inline-block',
                              padding: '4px 11px',
                              borderRadius: 8,
                              background: C.amberBg,
                              color: C.amberInk,
                              fontSize: 12,
                              fontWeight: 500,
                              border: 'none',
                              cursor: 'pointer',
                            }}
                          >
                            {f.explanation.split('.')[0]}{' '}
                            {expandedFlag === `${shift.id}-${i}` ? '▴' : '▾'}
                          </button>
                          {expandedFlag === `${shift.id}-${i}` && (
                            <div style={{ fontSize: 12.5, color: C.ink50, padding: '6px 2px' }}>
                              {f.explanation}. {f.action}
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    onClick={() => handleApprove(shift.id)}
                    disabled={busy !== null}
                    style={{
                      flex: 2,
                      padding: 14,
                      background: C.forest,
                      color: '#fff',
                      border: 'none',
                      borderRadius: 11,
                      fontWeight: 500,
                      fontSize: 15.5,
                      cursor: busy ? 'default' : 'pointer',
                      opacity: busy && !isBusy ? 0.5 : 1,
                      minHeight: 54,
                    }}
                  >
                    {isBusy ? 'Approving…' : 'Approve'}
                  </button>
                  <button
                    onClick={() =>
                      setQueryingShift(queryingShift === shift.id ? null : shift.id)
                    }
                    disabled={busy !== null}
                    style={{
                      flex: 1,
                      padding: 14,
                      background: 'transparent',
                      color: C.ink,
                      border: `1px solid ${C.rule2}`,
                      borderRadius: 11,
                      fontWeight: 500,
                      fontSize: 14,
                      cursor: busy ? 'default' : 'pointer',
                      minHeight: 54,
                    }}
                  >
                    Something&rsquo;s off
                  </button>
                </div>

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

        {approvedToday.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <button
              onClick={() => setShowApproved(!showApproved)}
              style={{
                width: '100%',
                padding: 12,
                background: 'transparent',
                border: `1px solid ${C.rule2}`,
                borderRadius: 12,
                fontWeight: 500,
                fontSize: 13.5,
                cursor: 'pointer',
                color: C.ink50,
              }}
            >
              {showApproved ? 'Hide' : 'Show'} {approvedToday.length} approved today
            </button>
            {showApproved && (
              <div style={{ marginTop: 8 }}>
                {approvedToday.map((shift) => (
                  <div
                    key={shift.id}
                    style={{
                      background: C.paper,
                      borderRadius: 11,
                      padding: '11px 14px',
                      marginBottom: 8,
                      border: `1px solid ${C.rule}`,
                      opacity: 0.8,
                    }}
                  >
                    <div style={{ fontWeight: 500, fontSize: 14, color: C.ink }}>
                      {shift.workers?.first_name} {shift.workers?.last_name}
                    </div>
                    <div style={{ fontSize: 12, color: C.ink50 }}>
                      {shift.sites?.name} · {parseFloat(shift.total_hours ?? '0').toFixed(1)} hrs ·
                      approved {shift.supervisor_approved_at ? timeAgo(shift.supervisor_approved_at) : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div
          style={{
            marginTop: 28,
            paddingTop: 18,
            borderTop: `1px solid ${C.rule}`,
            textAlign: 'center',
          }}
        >
          <p style={{ font: `italic 400 13.5px/1.5 ${C.serif}`, color: C.ink50, margin: '0 0 8px' }}>
            Every hour here is sealed and tamper-proof — what you approve is what gets paid.
          </p>
          <a
            href="https://flosmosis.com"
            style={{ fontSize: 13, color: C.forestDeep, textDecoration: 'none', fontWeight: 500 }}
          >
            New to FLOSTRUCTION? See how it works →
          </a>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.bg,
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      {children}
    </div>
  );
}

function Wordmark() {
  return (
    <span
      style={{
        fontWeight: 600,
        fontSize: 15,
        letterSpacing: '0.08em',
        color: C.navy,
        fontFamily: 'ui-monospace, monospace',
      }}
    >
      FLOSTRUCTION
    </span>
  );
}

function QueryForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <div style={{ marginTop: 10 }}>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="What looks off? (e.g. hours don't match, wasn't on site)"
        style={{
          width: '100%',
          padding: 11,
          fontSize: 14,
          borderRadius: 10,
          border: `1px solid ${C.rule2}`,
          minHeight: 64,
          boxSizing: 'border-box',
          background: '#fff',
          color: C.ink,
          fontFamily: 'inherit',
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          onClick={() => reason.trim() && onSubmit(reason.trim())}
          disabled={!reason.trim()}
          style={{
            flex: 1,
            padding: 11,
            background: C.red,
            color: '#fff',
            border: 'none',
            borderRadius: 9,
            fontWeight: 500,
            fontSize: 14,
            cursor: reason.trim() ? 'pointer' : 'not-allowed',
            opacity: reason.trim() ? 1 : 0.5,
          }}
        >
          Send to the office
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '11px 16px',
            background: 'transparent',
            border: `1px solid ${C.rule2}`,
            borderRadius: 9,
            fontSize: 14,
            cursor: 'pointer',
            color: C.ink,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
