'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Supervisor {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  is_active: boolean;
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

export default function SupervisorEdit({ supervisor }: { supervisor: Supervisor }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: supervisor.name,
    phone: supervisor.phone,
    email: supervisor.email ?? '',
  });
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [activeBusy, setActiveBusy] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: string): void {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function patch(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(`/api/command/supervisors/${supervisor.id}`, {
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
      const r = await patch({ name: form.name, phone: form.phone, email: form.email });
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
    <section className="sect" aria-label="Edit supervisor">
      <h2 className="label">Details</h2>
      <div className="door">
        <p>The supervisor approves shifts by SMS. Changing these is an amendment, recorded in History below.</p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 10,
            marginTop: 12,
          }}
        >
          <input style={FIELD} aria-label="Name" placeholder="Name" value={form.name} onChange={(e) => set('name', e.target.value)} />
          <input style={FIELD} aria-label="Mobile" placeholder="Mobile · 04xx xxx xxx" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          <input style={FIELD} aria-label="Email (optional)" placeholder="Email (optional)" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <button type="button" className={state !== 'saving' ? 'btn amber' : 'btn quiet'} disabled={state === 'saving'} onClick={() => void save()}>
            {state === 'saving' ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" className="btn quiet" disabled={activeBusy} onClick={() => void setActive(!supervisor.is_active)}>
            {activeBusy ? 'Working…' : supervisor.is_active ? 'Deactivate' : 'Reactivate'}
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
