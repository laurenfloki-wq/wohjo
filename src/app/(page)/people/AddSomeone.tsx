'use client';

// Add someone — the inline composer (dispatch SS5 BUILD d). Wired to
// the existing tested command APIs; nothing new touches the database
// directly. Worker needs employee number + pay rate because the
// payroll export requires them — the SMS self-completion flow is a
// recorded parking-lot item.

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Role = 'worker' | 'supervisor';

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

export default function AddSomeone() {
  const router = useRouter();
  const [role, setRole] = useState<Role>('worker');
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    first: '',
    last: '',
    phone: '',
    employeeId: '',
    payRate: '',
  });

  function set<K extends keyof typeof form>(k: K, v: string): void {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(): Promise<void> {
    setState('saving');
    setMessage('');
    try {
      const res =
        role === 'worker'
          ? await fetch('/api/command/workers', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                first_name: form.first.trim(),
                last_name: form.last.trim(),
                phone: form.phone.trim(),
                employee_id: form.employeeId.trim(),
                pay_rate: form.payRate.trim(),
              }),
            })
          : await fetch('/api/command/supervisors', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: `${form.first.trim()} ${form.last.trim()}`.trim(),
                phone: form.phone.trim(),
              }),
            });
      if (res.ok) {
        setState('done');
        setMessage(
          role === 'worker'
            ? 'Added. Their record starts now — every sealed hour belongs to them.'
            : 'Added. They can approve shifts by SMS from this minute.',
        );
        setForm({ first: '', last: '', phone: '', employeeId: '', payRate: '' });
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

  const ready =
    form.first.trim().length > 0 &&
    form.phone.trim().length > 0 &&
    (role === 'supervisor' ||
      (form.last.trim().length > 0 &&
        form.employeeId.trim().length > 0 &&
        form.payRate.trim().length > 0));

  return (
    <div className="door" style={{ marginTop: 20 }}>
      <div className="t">Add someone</div>
      <p>Name and mobile. A worker also needs the two numbers payroll needs.</p>
      <div role="radiogroup" aria-label="Role" style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {(['worker', 'supervisor'] as const).map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={role === r}
            className={role === r ? 'btn amber' : 'btn quiet'}
            onClick={() => setRole(r)}
          >
            {r === 'worker' ? 'Worker' : 'Supervisor'}
          </button>
        ))}
      </div>
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
          aria-label="First name"
          placeholder="First name"
          value={form.first}
          onChange={(e) => set('first', e.target.value)}
        />
        <input
          style={FIELD}
          aria-label="Last name"
          placeholder={role === 'worker' ? 'Last name' : 'Last name (optional)'}
          value={form.last}
          onChange={(e) => set('last', e.target.value)}
        />
        <input
          style={FIELD}
          aria-label="Mobile"
          placeholder="Mobile · 04xx xxx xxx"
          inputMode="tel"
          value={form.phone}
          onChange={(e) => set('phone', e.target.value)}
        />
        {role === 'worker' ? (
          <>
            <input
              style={FIELD}
              aria-label="Employee number"
              placeholder="Employee number"
              value={form.employeeId}
              onChange={(e) => set('employeeId', e.target.value)}
            />
            <input
              style={FIELD}
              aria-label="Pay rate per hour"
              placeholder="Pay rate · $/hr"
              inputMode="decimal"
              value={form.payRate}
              onChange={(e) => set('payRate', e.target.value)}
            />
          </>
        ) : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <button
          type="button"
          className={ready && state !== 'saving' ? 'btn amber' : 'btn quiet'}
          disabled={!ready || state === 'saving'}
          onClick={() => void submit()}
        >
          {state === 'saving' ? 'Adding…' : role === 'worker' ? 'Add worker' : 'Add supervisor'}
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
