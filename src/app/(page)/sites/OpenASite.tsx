'use client';

// Open a site — name + address; the 150m geofence drafts itself and
// stays editable. Wired to the existing tested POST /api/command/sites.
// Geocoding the address to lat/lng is a recorded parking-lot item
// (needs a geocoding-provider decision).

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const FIELD: React.CSSProperties = {
  background: 'var(--paper-raise)',
  border: '1px solid var(--pp-rule-2)',
  borderRadius: 9,
  color: 'var(--ink)',
  fontFamily: 'var(--pp-sans)',
  fontSize: 14.5,
  padding: '11px 14px',
  minWidth: 0,
};

export default function OpenASite() {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ name: '', address: '', radius: '150' });

  async function submit(): Promise<void> {
    setState('saving');
    setMessage('');
    try {
      const res = await fetch('/api/command/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          address: form.address.trim() || undefined,
          geofence_radius_metres: form.radius.trim() || '150',
        }),
      });
      if (res.ok) {
        setState('done');
        setMessage('Site opened. Its record starts now and outlives it.');
        setForm({ name: '', address: '', radius: '150' });
        router.refresh();
      } else {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setState('error');
        setMessage(body?.error ?? 'That didn’t save. Nothing was recorded — try again.');
      }
    } catch {
      setState('error');
      setMessage('That didn’t save. Nothing was recorded — try again.');
    }
  }

  const ready = form.name.trim().length > 0;

  return (
    <div className="door" style={{ marginTop: 20 }}>
      <div className="t">Open a site</div>
      <p>Name and address. The 150&nbsp;m geofence drafts itself — edit it any time.</p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10,
          marginTop: 12,
        }}
      >
        <input
          style={FIELD}
          aria-label="Site name"
          placeholder="Site name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <input
          style={FIELD}
          aria-label="Address"
          placeholder="Address (optional)"
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
        />
        <input
          style={FIELD}
          aria-label="Geofence radius in metres"
          placeholder="Geofence · metres"
          inputMode="numeric"
          value={form.radius}
          onChange={(e) => setForm((f) => ({ ...f, radius: e.target.value }))}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <button
          type="button"
          className={ready && state !== 'saving' ? 'btn amber' : 'btn quiet'}
          disabled={!ready || state === 'saving'}
          onClick={() => void submit()}
        >
          {state === 'saving' ? 'Opening…' : 'Open site'}
        </button>
        <span
          aria-live="polite"
          aria-atomic="true"
          style={{
            fontFamily: 'var(--pp-serif)',
            fontStyle: 'italic',
            fontSize: 14.5,
            color: state === 'error' ? 'var(--pp-red)' : 'var(--pp-green)',
          }}
        >
          {message}
        </span>
      </div>
    </div>
  );
}
