'use client';

// CorrectionModal — admin UI for issuing dispute / bug / supervisor-re-
// approval corrections on a sealed shift. Refactored onto the design-
// system Dialog + Select primitives so the modal:
//   - has WCAG-AA contrast on the new --surface (was black-on-black);
//   - traps focus, closes on ESC, click-scrim, or X;
//   - uses the readable custom Select (was an unstyled native <select>).
//
// Behaviour unchanged: POSTs to /api/command/shifts/{shiftId}/correct
// with { correction_type, parent_shift_event_id, correction_reason }.
// The corrective event extends the immutable hash chain — the original
// event is never modified.

import { useState } from 'react';
import { Dialog, DialogBody, DialogFooter, Select, Button } from './ui';

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
      'Admin agrees with a worker dispute. The original event stays in the chain; this corrective event extends it.',
  },
  BUG_CORRECTION: {
    label: 'System bug correction',
    description:
      'A system bug caused incorrect data to be sealed. The original stays in the chain; the corrective event documents the fix.',
  },
  SUPERVISOR_RE_APPROVAL: {
    label: 'Supervisor re-approval',
    description:
      'The supervisor approval was wrong (typo on YES, approved a disputed shift, etc.). The original approval stays; the re-approval extends.',
  },
};

const OPTIONS = (Object.keys(TYPE_LABELS) as CorrectionType[]).map((t) => ({
  value: t,
  label: TYPE_LABELS[t].label,
  description: TYPE_LABELS[t].description,
}));

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

  if (done) {
    return (
      <Dialog
        open
        onClose={onClose}
        eyebrow="Issue correction"
        title="Correction recorded"
        description="The corrective event is sealed and linked to the original. The worker is notified through the standard workflow."
      >
        <DialogFooter>
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      eyebrow="Issue correction"
      title="Extend the chain with a corrective record"
      description="The original event stays sealed. Your correction extends the chain with full provenance."
    >
      <form onSubmit={handleSubmit} data-testid="correction-modal-form">
        <DialogBody>
          <div style={{ marginBottom: 'var(--s-4)' }}>
            <label
              id="correction-type-label"
              htmlFor=""
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--ink-secondary)',
                letterSpacing: '0.04em',
                marginBottom: 6,
              }}
            >
              Correction type
            </label>
            <Select
              value={correctionType}
              onChange={(v) => setCorrectionType(v as CorrectionType)}
              options={OPTIONS}
              labelledBy="correction-type-label"
            />
            <p
              style={{
                marginTop: 8,
                marginBottom: 0,
                fontSize: 'var(--t-sm)',
                color: 'var(--ink-secondary)',
                lineHeight: 1.5,
              }}
            >
              {TYPE_LABELS[correctionType].description}
            </p>
          </div>

          <div>
            <label
              htmlFor="correction-modal-reason"
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--ink-secondary)',
                letterSpacing: '0.04em',
                marginBottom: 6,
              }}
            >
              Reason
              <span aria-hidden="true" style={{ color: 'var(--accent)', marginLeft: 4 }}>
                *
              </span>
              <span className="sr-only"> (required)</span>
            </label>
            <textarea
              id="correction-modal-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              required
              placeholder="Document why this correction is being issued. Worker-facing receipts will reference this reason."
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 'var(--t-base)',
                background: 'var(--surface)',
                color: 'var(--ink)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--r-md)',
                fontFamily: 'var(--font-sans)',
                resize: 'vertical',
                minHeight: 100,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {errorMessage ? (
            <div
              role="alert"
              aria-live="assertive"
              style={{
                marginTop: 'var(--s-3)',
                padding: '10px 14px',
                background: 'var(--flagged-bg)',
                border: '1px solid var(--flagged-border)',
                color: 'var(--flagged)',
                borderRadius: 'var(--r-md)',
                fontSize: 'var(--t-sm)',
              }}
            >
              {errorMessage}
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter align="between">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={submitting}
            disabled={reason.trim().length === 0}
            data-testid="correction-modal-submit"
          >
            {submitting ? 'Recording…' : 'Record correction'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
