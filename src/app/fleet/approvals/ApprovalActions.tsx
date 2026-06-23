'use client';

// Approve/reject buttons for one pending gate. Posts to the fleet approvals API.
// The fleet secret is supplied by the director at the prompt (kept out of the
// client bundle); in production this page sits behind director auth and the
// resolve call is made server-side.

import { useState } from 'react';

export function ApprovalActions({ approvalId }: { approvalId: string }) {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');

  async function resolve(decision: 'approved' | 'rejected') {
    const secret = window.prompt('Fleet secret');
    if (!secret) return;
    setState('working');
    try {
      const res = await fetch('/api/fleet/approvals', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-fleet-secret': secret },
        body: JSON.stringify({ approvalId, decision, resolvedBy: 'director' }),
      });
      setState(res.ok ? 'done' : 'error');
    } catch {
      setState('error');
    }
  }

  if (state === 'done') return <span>resolved</span>;
  if (state === 'error') return <span>error - retry</span>;
  return (
    <span>
      <button type="button" disabled={state === 'working'} onClick={() => resolve('approved')}>
        Approve
      </button>{' '}
      <button type="button" disabled={state === 'working'} onClick={() => resolve('rejected')}>
        Reject
      </button>
    </span>
  );
}
