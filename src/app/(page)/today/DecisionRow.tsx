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
  const [state, setState] = useState<'idle' | 'sealing' | 'sealed' | 'failed'>('idle');

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
      setState(res.ok ? 'sealed' : 'failed');
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
      {state === 'idle' || state === 'failed' ? (
        <button type="button" className="btn amber" onClick={() => void approve()}>
          Approve
        </button>
      ) : null}
    </div>
  );
}
