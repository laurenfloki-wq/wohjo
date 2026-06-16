'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Site {
  id: string;
  name: string;
  address: string | null;
  site_code: string | null;
  geofence_radius_metres: number | null;
  is_active: boolean;
  supervisor_is_director: boolean;
}

const FIELD: React.CSSProperties = {
  background: 'var(--paper-raise)',
  border: '1px solid var(--pp-rule-2)',
  borderRadius: 9,
  color: 'var(--ink)',
  fontFamily: 'var(--pp-sans)',
  fontSize: 14.5,
  padding: '11px 14px',
  outline: 'none',
  minWidth: 0,
};

export default function SiteEdit({ site }: { site: Site }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: site.name,
    address: site.address ?? '',
    site_code: site.site_code ?? '',
    geofence_radius_metres: String(site.geofence_radius_metres ?? 200),
  });
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [activeBusy, setActiveBusy] = useState(false);
  const [sameAsDirector, setSameAsDirector] = useState(site.supervisor_is_director);

  function set<K extends keyof typeof form>(k: K, v: string): void {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function patch(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(`/api/command/sites/${site.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const b = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: b?.error ?? 'That didn’t save. Nothing was changed — try again.' };
  }

  async function save(): Promise<void> {
    setState('saving');
    setMessage('');
    try {
      const r = await patch({
        name: form.name,
        address: form.address,
        site_code: form.site_code,
        geofence_radius_metres: form.geofence_radius_metres,
        supervisor_is_director: sameAsDirector,
      });
      if (r.ok) {
        setState('done');
        setMessage('Saved. The change is recorded in History below.');
        router.refresh();
      } else {
        setState('error');
        setMessage(r.error ?? '');
      }
    } catch {
      setState('error');
      setMessage('That didn’t save. Nothing was changed — try again.');
    }
  }

  async function setActive(next: boolean): Promise<void> {
    setActiveBusy(true);
    setMessage('');
    try {
      const r = await patch({ is_active: next });
      if (r.ok) router.refresh();
      else {
        setState('error');
        setMessage(r.error ?? 'Could not update status.');
      }
    } catch {
      setState('error');
      setMessage('Could not update status.');
    } finally {
      setActiveBusy(false);
    }
  }

  return (
    <section className="sect" aria-label="Edit site">
      <h2 className="label">Details</h2>
      <div className="door">
        <p>
          Site details and the geofence radius arrivals are checked against. Changing these is an
          amendment, recorded in History below.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 10,
            marginTop: 12,
          }}
        >
          <input
            style={FIELD}
            aria-label="Site name"
            placeholder="Site name"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
          <input
            style={FIELD}
            aria-label="Address"
            placeholder="Address"
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
          />
          <input
            style={FIELD}
            aria-label="Site code (optional)"
            placeholder="Site code (optional)"
            value={form.site_code}
            onChange={(e) => set('site_code', e.target.value)}
          />
          <input
            style={FIELD}
            aria-label="Geofence radius in metres"
            placeholder="Geofence · 50–1000 m"
            inputMode="numeric"
            value={form.geofence_radius_metres}
            onChange={(e) => set('geofence_radius_metres', e.target.value)}
          />
        </div>
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
            Skip the supervisor text for this site — you approve each shift in one tap (supervisor
            and payroll together).
          </span>
        </label>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginTop: 12,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            className={state !== 'saving' ? 'btn amber' : 'btn quiet'}
            disabled={state === 'saving'}
            onClick={() => void save()}
          >
            {state === 'saving' ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            className="btn quiet"
            disabled={activeBusy}
            onClick={() => void setActive(!site.is_active)}
          >
            {activeBusy ? 'Working…' : site.is_active ? 'Close site' : 'Reopen site'}
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
    </section>
  );
}
