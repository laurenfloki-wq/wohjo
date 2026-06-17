'use client';

import { useState } from 'react';

// One decision: one sentence, one button. Live mode approves via the
// existing command endpoint (tenant-scoped, idempotent). Demo mode
// rehearses the seal locally and never touches the network.
export default function DecisionRow(props: {
  shiftId: string;
  sentence: string;
  meta: string;
  demo?: boolean;
}) {
  const [state, setState] = useState<'idle' | 'sealing' | 'sealed' | 'failed' | 'awaiting'>('idle');

  async function approve(): Promise<void> {
    setState('sealing');
    if (props.demo === true) {
      setTimeout(() => setState('sealed'), 900);
      return;
    }
    try {
      const res = await fetch(`/api/command/shifts/${props.shiftId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        setState('sealed');
        return;
      }
      // A 409 INVALID_STATE means the shift hasn't cleared supervisor
      // approval yet — that's a "wait", not a "retry". Distinguish it so
      // the admin isn't told to re-tap a button that can't succeed yet.
      let code: string | undefined;
      try {
        code = ((await res.json()) as { error_code?: string }).error_code;
      } catch {
        // non-JSON body — fall through to the generic failure path
      }
      setState(res.status === 409 || code === 'INVALID_STATE' ? 'awaiting' : 'failed');
    } catch {
      setState('failed');
    }
  }

  return (
    <div className={`row${state === 'sealed' ? ' done' : ''}`}>
      <div className="tx">
        <div className="h">{props.sentence}</div>
        <div className="m">{props.meta}</div>
      </div>
      <span className="doneTag" aria-live="polite" aria-atomic="true">
        {state === 'sealed' ? 'approved · sealed' : state === 'sealing' ? 'sealing…' : ''}
      </span>
      {state === 'failed' ? (
        <span className="m" role="status">
          could not approve — try again
        </span>
      ) : null}
      {state === 'awaiting' ? (
        <span className="m" role="status">
          awaiting supervisor approval
        </span>
      ) : null}
      {state === 'idle' || state === 'failed' || state === 'awaiting' ? (
        <button type="button" className="btn amber" onClick={() => void approve()}>
          Approve
        </button>
      ) : null}
    </div>
  );
}
