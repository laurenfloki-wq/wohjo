'use client';

// Payroll-provider mapping — re-homed into the warm surface. Reads the
// merged canonical + tenant mappings from the existing GET, and saves a
// single row at a time through the existing POST. Operational config, the
// same data class as a site's geofence — editable, not sealed evidence.

import { useEffect, useState } from 'react';

interface MappingRow {
  flostruction_category: string;
  myob_activity_id: string;
  updated_at: string | null;
}

interface RowState {
  category: string;
  value: string;
  saved: boolean;
  saving: boolean;
  error: string | null;
}

function label(category: string): string {
  return category.replace(/_/g, ' ');
}

export default function PayrollMapping() {
  const [rows, setRows] = useState<RowState[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch('/api/command/payroll-mapping')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { mappings?: MappingRow[] }) => {
        if (!active) return;
        setRows(
          (body.mappings ?? []).map((m) => ({
            category: m.flostruction_category,
            value: m.myob_activity_id,
            saved: false,
            saving: false,
            error: null,
          })),
        );
      })
      .catch(() => {
        if (active) setLoadError('Could not load mappings. The classic console still works.');
      });
    return () => {
      active = false;
    };
  }, []);

  function setRow(i: number, patch: Partial<RowState>) {
    setRows((prev) => (prev === null ? prev : prev.map((r, j) => (j === i ? { ...r, ...patch } : r))));
  }

  async function save(i: number) {
    if (rows === null) return;
    const row = rows[i];
    setRow(i, { saving: true, error: null, saved: false });
    try {
      const res = await fetch('/api/command/payroll-mapping', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ flostruction_category: row.category, myob_activity_id: row.value.trim() }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setRow(i, { saving: false, error: b.error ?? 'Save failed.' });
        return;
      }
      setRow(i, { saving: false, saved: true });
    } catch {
      setRow(i, { saving: false, error: 'Save could not be reached.' });
    }
  }

  if (loadError !== null) {
    return <div className="allclear">{loadError}</div>;
  }
  if (rows === null) {
    return <div className="allclear">Loading mappings…</div>;
  }

  return (
    <div className="maptable">
      {rows.map((r, i) => (
        <div className="maprow" key={r.category}>
          <span className="mapcat">{label(r.category)}</span>
          <input
            className="mapinput"
            type="text"
            value={r.value}
            placeholder="MYOB activity ID"
            aria-label={`MYOB activity ID for ${label(r.category)}`}
            onChange={(e) => setRow(i, { value: e.target.value, saved: false })}
          />
          <button
            type="button"
            className="btn quiet mapsave"
            disabled={r.saving}
            onClick={() => void save(i)}
          >
            {r.saving ? 'Saving…' : r.saved ? 'Saved' : 'Save'}
          </button>
          {r.error !== null ? <span className="maperr">{r.error}</span> : null}
        </div>
      ))}
    </div>
  );
}
