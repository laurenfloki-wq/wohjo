'use client';

// CorrectionModal — Phase 1 admin UI for issuing dispute / bug /
// supervisor-re-approval corrections on a sealed shift.
//
// Per ~/FLOSMOSIS/operations/dispute-correction-workflow-v1.md, the
// correction extends the immutable hash chain — original event is
// never modified. UI surfaces canonical mockup language: charcoal
// surface, Archivo Narrow display, mono-uppercase labels, amber
// primary CTA, warm-red destructive accent.
//
// The modal is invoked with:
//   - shiftId (target shift)
//   - parentShiftEventId (the original event being corrected)
//   - onSuccess() callback to refresh parent state
//   - onClose() callback to dismiss
//
// Phase 2 will add: per-correction-type structured fields (e.g.,
// CORRECTION shows hours/site/date inputs; SUPERVISOR_RE_APPROVAL
// shows new supervisor selector). Phase 1 is free-text reason only.

import { useState } from 'react';

export type CorrectionType = 'CORRECTION' | 'BUG_CORRECTION' | 'SUPERVISOR_RE_APPROVAL';

interface Props {
  shiftId: string;
  parentShiftEventId: string;
  onSuccess?: () => void;
  onClose: () => void;
}

const TYPE_LABELS: Record<CorrectionType, { label: string; description: string }> = {
  CORRECTION: {
    label: 'Worker dispute correction',
    description:
      'Admin agrees with a worker dispute. Original event stays in the chain; this corrective event extends it.',
  },
  BUG_CORRECTION: {
    label: 'System bug correction',
    description:
      'A system bug caused incorrect data to be sealed. Original stays in the chain; corrective event documents the fix.',
  },
  SUPERVISOR_RE_APPROVAL: {
    label: 'Supervisor re-approval',
    description:
      'Supervisor approval was wrong (typo on YES code, approved disputed shift, etc.). Original approval stays; re-approval extends.',
  },
};

export default function CorrectionModal({
  shiftId,
  parentShiftEventId,
  onSuccess,
  onClose,
}: Props) {
  const [correctionType, setCorrectionType] = useState<CorrectionType>('CORRECTION');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage('');
    setSubmitting(true);
    try {
      const res = await fetch(`/api/command/shifts/${shiftId}/correct`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          correction_type: correctionType,
          parent_shift_event_id: parentShiftEventId,
          correction_reason: reason,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMessage(data.error ?? `Failed (HTTP ${res.status})`);
        setSubmitting(false);
        return;
      }
      setDone(true);
      setSubmitting(false);
      onSuccess?.();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error');
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-labelledby="correction-modal-title"
      data-testid="correction-modal"
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(15, 15, 16, 0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={{
        width: '100%', maxWidth: 560,
        background: 'var(--color-bg-secondary, #1A1A1C)',
        border: '1px solid var(--color-border, #2A2A2C)',
        borderRadius: 'var(--radius-card, 12px)',
        padding: 28,
        fontFamily: 'var(--font-sans), Inter, system-ui, sans-serif',
        color: 'var(--color-text-primary, #F5F2EA)',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono), monospace', fontSize: 11,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--color-amber, #D9A548)', marginBottom: 12,
        }}>
          Issue correction
        </div>
        <h2
          id="correction-modal-title"
          style={{
            fontFamily: 'var(--font-display), "Archivo Narrow", sans-serif',
            fontSize: 24, fontWeight: 700, margin: 0, marginBottom: 8,
            letterSpacing: '-0.012em',
          }}
        >
          Extend the chain with a corrective record
        </h2>
        <p style={{
          fontSize: 13, color: 'rgba(245,242,234,0.55)',
          margin: 0, marginBottom: 20, lineHeight: 1.55,
        }}>
          Per the WLES Foundation Constitution and the dispute-correction
          workflow, the original event stays sealed. Your correction
          extends the chain with full provenance.
        </p>

        {done ? (
          <div role="status" style={{
            padding: 16,
            background: 'rgba(45, 95, 63, 0.18)',
            border: '1px solid rgba(45, 95, 63, 0.55)',
            borderRadius: 'var(--radius-btn, 6px)',
            color: '#D9F0E0', fontSize: 13,
          }}>
            <strong>Recorded.</strong> The corrective event is sealed and
            linked to the original. Worker-facing notification is sent
            from the workflow worker (Phase 2 polish).
            <div style={{ marginTop: 14 }}>
              <button onClick={onClose} style={{
                padding: '8px 16px', background: 'var(--color-amber, #D9A548)',
                color: '#0F0F10', border: 'none', borderRadius: 'var(--radius-btn, 6px)',
                fontFamily: 'var(--font-mono), monospace',
                fontWeight: 600, fontSize: 12,
                letterSpacing: '0.14em', textTransform: 'uppercase',
                cursor: 'pointer',
              }}>Close</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label style={{ display: 'block', marginBottom: 16 }}>
              <span style={{
                display: 'block', fontFamily: 'var(--font-mono), monospace',
                fontSize: 10, fontWeight: 600, letterSpacing: '0.16em',
                color: 'var(--color-text-secondary, #C9C3B2)', marginBottom: 8,
                textTransform: 'uppercase',
              }}>Correction type</span>
              <select
                value={correctionType}
                onChange={(e) => setCorrectionType(e.target.value as CorrectionType)}
                style={{
                  width: '100%', padding: '10px 12px', fontSize: 14,
                  background: '#0F0F10', color: 'var(--color-text-primary, #F5F2EA)',
                  border: '1px solid var(--color-border-strong, #3A3A3C)',
                  borderRadius: 'var(--radius-btn, 6px)',
                  fontFamily: 'inherit',
                }}
              >
                {(Object.keys(TYPE_LABELS) as CorrectionType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t].label}</option>
                ))}
              </select>
              <p style={{
                margin: '8px 0 0', fontSize: 12,
                color: 'rgba(245,242,234,0.55)', lineHeight: 1.5,
              }}>{TYPE_LABELS[correctionType].description}</p>
            </label>

            <label style={{ display: 'block', marginBottom: 16 }}>
              <span style={{
                display: 'block', fontFamily: 'var(--font-mono), monospace',
                fontSize: 10, fontWeight: 600, letterSpacing: '0.16em',
                color: 'var(--color-text-secondary, #C9C3B2)', marginBottom: 8,
                textTransform: 'uppercase',
              }}>
                Reason <span style={{ color: 'var(--color-amber, #D9A548)', marginLeft: 4 }}>*</span>
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                required
                placeholder="Document WHY this correction is being issued. Worker-facing receipts will reference this reason."
                style={{
                  width: '100%', padding: '10px 12px', fontSize: 14,
                  background: '#0F0F10', color: 'var(--color-text-primary, #F5F2EA)',
                  border: '1px solid var(--color-border-strong, #3A3A3C)',
                  borderRadius: 'var(--radius-btn, 6px)',
                  fontFamily: 'inherit', resize: 'vertical', minHeight: 100,
                }}
              />
            </label>

            {errorMessage && (
              <div role="alert" style={{
                padding: '12px 14px',
                background: 'rgba(199, 75, 58, 0.12)',
                border: '1px solid rgba(199, 75, 58, 0.45)',
                color: '#F8D7CE', borderRadius: 'var(--radius-btn, 6px)',
                fontSize: 13, marginBottom: 14,
              }}>
                {errorMessage}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                type="submit"
                disabled={submitting || reason.trim().length === 0}
                style={{
                  padding: '12px 22px',
                  background: 'var(--color-amber, #D9A548)',
                  color: '#0F0F10', border: 'none',
                  borderRadius: 'var(--radius-btn, 6px)',
                  fontFamily: 'var(--font-mono), monospace',
                  fontWeight: 600, fontSize: 12,
                  letterSpacing: '0.14em', textTransform: 'uppercase',
                  cursor: submitting ? 'wait' : 'pointer',
                  opacity: submitting || reason.trim().length === 0 ? 0.55 : 1,
                }}
              >
                {submitting ? 'Recording…' : 'Record correction'}
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '12px 22px',
                  background: 'transparent',
                  color: 'var(--color-text-primary, #F5F2EA)',
                  border: '1px solid var(--color-border-strong, #3A3A3C)',
                  borderRadius: 'var(--radius-btn, 6px)',
                  fontFamily: 'var(--font-mono), monospace',
                  fontWeight: 600, fontSize: 12,
                  letterSpacing: '0.14em', textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
