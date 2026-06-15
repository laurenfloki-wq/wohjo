'use client';

// Run-when-safe button. Live (clickable) only when the run is READY AND
// enabled for this environment. Everywhere else it is a disabled, honest
// statement of the current state — including "ready, but running turns on
// at go-live" in production.

import { useState } from 'react';

interface Props {
  canRun: boolean;
  enabled: boolean;
  label: string;
  reason: string;
}

export default function RunButton({ canRun, enabled, label, reason }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const live = canRun && enabled;

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/command/payruns/run', { method: 'POST' });
      if (res.ok) {
        window.location.reload();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { reason?: string };
      setErr(body.reason ?? 'Run is unavailable right now.');
    } catch {
      setErr('Run could not be reached.');
    } finally {
      setBusy(false);
    }
  }

  const title = live
    ? 'Assemble and keep this run'
    : canRun && !enabled
      ? `${reason} Running turns on at go-live.`
      : reason;

  return (
    <span className="runwrap">
      <button
        type="button"
        className={`runbtn${live ? ' ready' : ''}`}
        disabled={!live || busy}
        title={title}
        onClick={live ? run : undefined}
      >
        {busy ? 'Running…' : label}
      </button>
      {err !== null ? (
        <span className="runerr" role="status">
          {err}
        </span>
      ) : null}
    </span>
  );
}
