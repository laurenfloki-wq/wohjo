'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Company {
  name: string;
  abn: string | null;
  contact_email: string;
  contact_phone: string | null;
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

export default function CompanyDetails({ company }: { company: Company }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: company.name,
    abn: company.abn ?? '',
    contact_email: company.contact_email,
    contact_phone: company.contact_phone ?? '',
  });
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  function set<K extends keyof typeof form>(k: K, v: string): void {
    setForm((f) => ({ ...f, [k]: v }));
    if (state !== 'idle') setState('idle');
  }

  async function save(): Promise<void> {
    setState('saving');
    setMessage('');
    try {
      const res = await fetch('/api/command/company', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setState('done');
        setMessage('Saved. The change is recorded in your audit trail.');
        router.refresh();
      } else {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        setState('error');
        setMessage(b?.error ?? 'That didn’t save. Nothing was changed — try again.');
      }
    } catch {
      setState('error');
      setMessage('That didn’t save. Nothing was changed — try again.');
    }
  }

  return (
    <div className="door">
      <p>
        Your business identity — the details that appear on exports and Evidence Packs. Every change
        is recorded.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 10,
          marginTop: 12,
        }}
      >
        <input
          style={FIELD}
          aria-label="Company name"
          placeholder="Company name"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
        />
        <input
          style={FIELD}
          aria-label="ABN"
          placeholder="ABN (11 digits)"
          inputMode="numeric"
          value={form.abn}
          onChange={(e) => set('abn', e.target.value)}
        />
        <input
          style={FIELD}
          aria-label="Contact email"
          placeholder="Contact email"
          inputMode="email"
          value={form.contact_email}
          onChange={(e) => set('contact_email', e.target.value)}
        />
        <input
          style={FIELD}
          aria-label="Contact phone (optional)"
          placeholder="Contact phone (optional)"
          inputMode="tel"
          value={form.contact_phone}
          onChange={(e) => set('contact_phone', e.target.value)}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={state !== 'saving' ? 'btn amber' : 'btn quiet'}
          disabled={state === 'saving'}
          onClick={() => void save()}
        >
          {state === 'saving' ? 'Saving…' : 'Save changes'}
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
