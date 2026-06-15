'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Worker {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  employee_id: string;
  pay_rate: string;
  award_classification: string | null;
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

export default function WorkerEdit({ worker }: { worker: Worker }) {
  const router = useRouter();
  const [form, setForm] = useState({
    first_name: worker.first_name,
    last_name: worker.last_name,
    phone: worker.phone,
    email: worker.email ?? '',
    employee_id: worker.employee_id,
    pay_rate: worker.pay_rate,
    award_classification: worker.award_classification ?? '',
  });
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [activeBusy, setActiveBusy] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: string): void {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function patch(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(`/api/command/workers/${worker.id}`, {
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
        first_name: form.first_name,
        last_name: form.last_name,
        phone: form.phone,
        email: form.email,
        employee_id: form.employee_id,
        pay_rate: form.pay_rate,
        award_classification: form.award_classification,
      });
      if (r.ok) {
        setState('done');
        setMessage('Saved. The change is recorded in this worker’s history below.');
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
    <section className="sect" aria-label="Edit worker">
      <h2 className="label">Details</h2>
      <div className="door">
        <p>
          The operational details payroll needs. Sealed hours are never editable; changing these is
          an amendment, recorded in History below.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 10,
            marginTop: 12,
          }}
        >
          <input style={FIELD} aria-label="First name" placeholder="First name" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} />
          <input style={FIELD} aria-label="Last name" placeholder="Last name" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} />
          <input style={FIELD} aria-label="Mobile" placeholder="Mobile · 04xx xxx xxx" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          <input style={FIELD} aria-label="Employee number" placeholder="Employee number" value={form.employee_id} onChange={(e) => set('employee_id', e.target.value)} />
          <input style={FIELD} aria-label="Pay rate per hour" placeholder="Pay rate · $/hr" inputMode="decimal" value={form.pay_rate} onChange={(e) => set('pay_rate', e.target.value)} />
          <input style={FIELD} aria-label="Email (optional)" placeholder="Email (optional)" value={form.email} onChange={(e) => set('email', e.target.value)} />
          <input style={FIELD} aria-label="Award classification (optional)" placeholder="Award (optional)" value={form.award_classification} onChange={(e) => set('award_classification', e.target.value)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <button type="button" className={state !== 'saving' ? 'btn amber' : 'btn quiet'} disabled={state === 'saving'} onClick={() => void save()}>
            {state === 'saving' ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" className="btn quiet" disabled={activeBusy} onClick={() => void setActive(!worker.is_active)}>
            {activeBusy ? 'Working…' : worker.is_active ? 'Deactivate' : 'Reactivate'}
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
