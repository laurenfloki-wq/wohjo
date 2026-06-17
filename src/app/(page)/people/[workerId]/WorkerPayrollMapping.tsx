'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CANONICAL_CATEGORIES,
  categoryLabel,
  type CanonicalCategory,
} from '@/lib/payroll/categories';

const FIELD: React.CSSProperties = {
  background: 'var(--paper-raise)',
  border: '1px solid var(--pp-rule-2)',
  borderRadius: 9,
  color: 'var(--ink)',
  fontFamily: 'var(--pp-mono, var(--pp-sans))',
  fontSize: 14.5,
  padding: '10px 12px',
  outline: 'none',
  minWidth: 0,
  width: '100%',
};

type MappingForm = Record<CanonicalCategory, string>;

function seed(initial: Record<string, string> | null): MappingForm {
  const out = {} as MappingForm;
  for (const cat of CANONICAL_CATEGORIES) out[cat] = initial?.[cat] ?? '';
  return out;
}

export default function WorkerPayrollMapping({
  workerId,
  workerName,
  initial,
}: {
  workerId: string;
  workerName: string;
  initial: Record<string, string> | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState<MappingForm>(() => seed(initial));
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  function set(cat: CanonicalCategory, v: string): void {
    setForm((f) => ({ ...f, [cat]: v }));
    if (state !== 'idle') setState('idle');
  }

  async function save(): Promise<void> {
    setState('saving');
    setMessage('');
    // Trim and drop blanks — the route replaces the whole map, so an empty
    // value means "this worker has no code for that category yet".
    const activity_mappings: Record<string, string> = {};
    for (const cat of CANONICAL_CATEGORIES) {
      const v = form[cat].trim();
      if (v.length > 0) activity_mappings[cat] = v;
    }
    try {
      const res = await fetch(`/api/command/workers/${workerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity_mappings }),
      });
      if (res.ok) {
        setState('done');
        setMessage('Saved. These codes flow into this worker’s next export.');
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

  const filled = CANONICAL_CATEGORIES.filter((c) => form[c].trim().length > 0).length;

  return (
    <section className="sect" aria-label="Payroll mapping">
      <h2 className="label">Payroll mapping · {filled}/8</h2>
      <div className="door">
        <p>
          Map each FLOSTRUCTION category to the Activity ID your payroll provider expects for{' '}
          {workerName}. Verified hours export under these codes — leave a row blank if it doesn’t
          apply to this worker.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(180px, 1fr) minmax(140px, 0.7fr)',
            gap: '10px 14px',
            alignItems: 'center',
            marginTop: 14,
          }}
        >
          {CANONICAL_CATEGORIES.map((cat) => (
            <div key={cat} style={{ display: 'contents' }}>
              <label
                htmlFor={`map-${cat}`}
                style={{ fontFamily: 'var(--pp-sans)', fontSize: 14, color: 'var(--ink)' }}
              >
                {categoryLabel(cat)}
              </label>
              <input
                id={`map-${cat}`}
                style={FIELD}
                placeholder="Activity ID"
                value={form[cat]}
                onChange={(e) => set(cat, e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={state !== 'saving' ? 'btn amber' : 'btn quiet'}
            disabled={state === 'saving'}
            onClick={() => void save()}
          >
            {state === 'saving' ? 'Saving…' : 'Save mapping'}
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
