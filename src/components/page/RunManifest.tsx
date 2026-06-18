'use client';

// The reviewable pay-run manifest — every approved shift about to be sealed,
// with aged (approved-late) shifts surfaced for an include/hold decision.
// Running posts the held shift ids; the server seals what's included and the
// decision lands in the audit log. The run is irreversible, so this manifest
// IS the confirmation step.

import { useState } from 'react';

export interface ManifestItem {
  id: string;
  worker: string;
  date: string; // YYYY-MM-DD
  dateLabel: string;
  hours: number;
  aged: boolean;
}

function fmtHours(n: number): string {
  return Number(n.toFixed(2)).toString();
}

export default function RunManifest({
  items,
  runEnabled,
}: {
  items: ManifestItem[];
  runEnabled: boolean;
}) {
  const [held, setHeld] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const included = items.filter((i) => !held.has(i.id));
  const hours = included.reduce((a, i) => a + i.hours, 0);
  const labelByDate = new Map(items.map((i) => [i.date, i.dateLabel]));
  const dates = included.map((i) => i.date).sort();
  const periodStart = dates[0];
  const periodEnd = dates[dates.length - 1];
  const aged = items.filter((i) => i.aged);

  function toggle(id: string): void {
    setHeld((h) => {
      const n = new Set(h);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function run(): Promise<void> {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/command/payruns/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hold_shift_ids: [...held] }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        exportId?: string;
        reason?: string;
        error?: string;
      };
      if (res.ok && j.exportId) {
        window.location.assign(`/payruns/${j.exportId}`);
        return;
      }
      setErr(j.reason ?? j.error ?? 'Run is unavailable right now.');
    } catch {
      setErr('Run could not be reached.');
    } finally {
      setBusy(false);
    }
  }

  const live = runEnabled && included.length > 0;
  const periodText = periodStart
    ? periodStart === periodEnd
      ? labelByDate.get(periodStart)
      : `${labelByDate.get(periodStart)} – ${labelByDate.get(periodEnd)}`
    : '';

  return (
    <div className="manifest">
      <p className="manifest-sum">
        <span className="ms-n">{included.length}</span>{' '}
        {included.length === 1 ? 'shift' : 'shifts'} · <span className="ms-n">{fmtHours(hours)}</span>{' '}
        verified hours{periodText ? <> · period {periodText}</> : ''}
      </p>

      {aged.length > 0 ? (
        <div className="manifest-aged">
          <p className="ma-head">
            <i className="ti ti-alert-triangle" aria-hidden="true" /> {aged.length} approved{' '}
            {aged.length === 1 ? 'shift is' : 'shifts are'} from before this week
          </p>
          <p className="ma-note">
            Approved late. Include them in this run, or hold for a later one — your choice is sealed
            with the run.
          </p>
          {aged.map((i) => {
            const isHeld = held.has(i.id);
            return (
              <div className={`ma-row${isHeld ? ' held' : ''}`} key={i.id}>
                <span className="ma-w">{i.worker}</span>
                <span className="ma-d">{i.dateLabel}</span>
                <span className="ma-h">{fmtHours(i.hours)}h</span>
                <button
                  type="button"
                  className={`ma-toggle${isHeld ? ' held' : ''}`}
                  onClick={() => toggle(i.id)}
                  aria-pressed={isHeld}
                >
                  {isHeld ? 'Held' : 'Included'}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="manifest-act">
        <button
          type="button"
          className={`runbtn${live ? ' ready' : ''}`}
          disabled={!live || busy}
          onClick={live ? () => void run() : undefined}
          title={runEnabled ? 'Assemble and seal this run' : 'Running turns on at go-live.'}
        >
          {busy
            ? 'Running…'
            : `Run pay run · ${included.length} ${included.length === 1 ? 'shift' : 'shifts'} · ${fmtHours(hours)} hrs${live ? ' →' : ''}`}
        </button>
        {err !== null ? (
          <span className="runerr" role="status">
            {err}
          </span>
        ) : null}
      </div>
    </div>
  );
}
