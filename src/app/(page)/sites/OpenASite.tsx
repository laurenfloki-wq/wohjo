'use client';

// Open a site — name + address; "Check address" resolves the address to
// coordinates (server-side, AU-biased, OpenStreetMap Nominatim — data
// (c) OpenStreetMap contributors) so the 150 m geofence drafts itself
// around a real point. Coordinates travel with the create; the map link
// lets you eyeball it before opening.

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
  const [state, setState] = useState<'idle' | 'checking' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ name: '', address: '', radius: '150' });
  const [geo, setGeo] = useState<{ display: string; lat: number; lng: number } | null>(null);
  // "Supervisor = director": skip the supervisor SMS for this site and let
  // the director clear both gates in one approval (sites.supervisor_is_director).
  const [sameAsDirector, setSameAsDirector] = useState(false);

  async function checkAddress(): Promise<void> {
    if (form.address.trim().length < 4 || state === 'checking') return;
    setState('checking');
    setMessage('');
    setGeo(null);
    try {
      const res = await fetch(`/api/page/geocode?q=${encodeURIComponent(form.address.trim())}`);
      if (res.ok) {
        const d = (await res.json()) as { display_name: string; lat: number; lng: number };
        setGeo({ display: d.display_name, lat: d.lat, lng: d.lng });
        setState('idle');
      } else if (res.status === 404) {
        setState('idle');
        setMessage(
          'No match for that address — check the spelling, or open the site without coordinates.',
        );
      } else {
        setState('idle');
        setMessage('Address lookup is unavailable right now — you can still open the site.');
      }
    } catch {
      setState('idle');
      setMessage('Address lookup is unavailable right now — you can still open the site.');
    }
  }

  async function submit(): Promise<void> {
    setState('saving');
    setMessage('');
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        address: form.address.trim() || undefined,
        geofence_radius_metres: form.radius.trim() || '150',
        supervisor_is_director: sameAsDirector,
      };
      if (geo !== null) {
        payload.geofence_lat = geo.lat;
        payload.geofence_lng = geo.lng;
      }
      const res = await fetch('/api/command/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setState('done');
        setMessage(
          geo !== null
            ? 'Site opened with its geofence centred on the address. Its record starts now.'
            : 'Site opened. Add coordinates any time — its record starts now.',
        );
        setForm({ name: '', address: '', radius: '150' });
        setGeo(null);
        setSameAsDirector(false);
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

  const ready = form.name.trim().length > 0 && state !== 'saving' && state !== 'checking';

  return (
    <div className="door" style={{ marginTop: 20 }}>
      <div className="t">Open a site</div>
      <p>
        Name and address. Check the address and the 150&nbsp;m geofence drafts itself around it —
        editable any time.
      </p>
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
          placeholder="Address"
          value={form.address}
          onChange={(e) => {
            const v = e.target.value;
            setForm((f) => ({ ...f, address: v }));
            setGeo(null);
          }}
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
      {geo !== null ? (
        <p style={{ marginTop: 10, fontSize: 13.5 }} aria-live="polite">
          <span style={{ color: 'var(--pp-green)' }}>Found:</span> {geo.display}{' '}
          <span className="mono" style={{ fontSize: 12, color: 'var(--ink-50)' }}>
            {geo.lat.toFixed(5)}, {geo.lng.toFixed(5)}
          </span>{' '}
          ·{' '}
          <a
            href={`https://www.google.com/maps?q=${geo.lat},${geo.lng}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--pp-green)' }}
          >
            view on a map ↗
          </a>
        </p>
      ) : null}
      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          marginTop: 14,
          cursor: 'pointer',
          fontSize: 14,
          color: 'var(--ink-70)',
          lineHeight: 1.5,
          maxWidth: '46em',
        }}
      >
        <input
          type="checkbox"
          checked={sameAsDirector}
          onChange={(e) => setSameAsDirector(e.target.checked)}
          style={{
            marginTop: 3,
            width: 16,
            height: 16,
            flexShrink: 0,
            accentColor: 'var(--pp-green)',
          }}
        />
        <span>
          <b style={{ color: 'var(--ink)' }}>The supervisor and director are the same person.</b>{' '}
          Skip the supervisor text for this site — you approve each shift in one tap (supervisor and
          payroll together).
        </span>
      </label>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}
      >
        <button
          type="button"
          className="btn quiet"
          disabled={form.address.trim().length < 4 || state === 'checking'}
          onClick={() => void checkAddress()}
        >
          {state === 'checking' ? 'Checking…' : 'Check address'}
        </button>
        <button
          type="button"
          className={ready ? 'btn amber' : 'btn quiet'}
          disabled={!ready}
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
      <p
        style={{
          marginTop: 10,
          fontFamily: 'var(--pp-mono)',
          fontSize: 10.5,
          color: 'var(--ink-35)',
        }}
      >
        address lookup © OpenStreetMap contributors
      </p>
    </div>
  );
}
