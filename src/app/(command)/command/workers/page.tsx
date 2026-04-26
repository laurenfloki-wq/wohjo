'use client';

import { useEffect, useState } from 'react';
import CommandNav from '@/components/command/CommandNav';

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

interface NewWorkerForm {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  employee_id: string;
  pay_rate: string;
  award_classification: string;
}

const emptyForm: NewWorkerForm = {
  first_name: '',
  last_name: '',
  phone: '',
  email: '',
  employee_id: '',
  pay_rate: '',
  award_classification: '',
};

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewWorkerForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => { loadWorkers(); }, []);

  async function loadWorkers() {
    setLoading(true);
    const res = await fetch('/api/command/workers');
    const data = await res.json() as { workers?: Worker[] };
    setWorkers(data.workers ?? []);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    const res = await fetch('/api/command/workers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json() as { error?: string };
    if (!res.ok) {
      setFormError(data.error ?? 'Failed to add worker');
      setSubmitting(false);
      return;
    }
    setForm(emptyForm);
    setShowForm(false);
    setSubmitting(false);
    loadWorkers();
  }

  return (
    <>
      <CommandNav />
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>Workers</h1>
            <p style={{ fontSize: '14px', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
              {workers.length} active worker{workers.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              padding: '10px 18px',
              background: 'var(--color-navy)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '14px',
              border: 'none',
              borderRadius: 'var(--radius-btn)',
              cursor: 'pointer',
            }}
          >
            {showForm ? 'Cancel' : '+ Add Worker'}
          </button>
        </div>

        {/* Add Worker Form */}
        {showForm && (
          <div style={{
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-card)',
            padding: '24px',
            marginBottom: '24px',
          }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px', color: 'var(--color-text-primary)' }}>
              Add New Worker
            </h2>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                {[
                  { field: 'first_name' as const, label: 'FIRST NAME', required: true, placeholder: 'Joao' },
                  { field: 'last_name' as const, label: 'LAST NAME', required: true, placeholder: 'Muniz' },
                  { field: 'phone' as const, label: 'MOBILE', required: true, placeholder: '04XX XXX XXX' },
                  { field: 'email' as const, label: 'EMAIL', placeholder: 'optional' },
                  { field: 'employee_id' as const, label: 'EMPLOYEE ID', required: true, placeholder: 'EMP-001 (Employment Hero)' },
                  { field: 'pay_rate' as const, label: 'PAY RATE ($/hr)', required: true, placeholder: '28.47' },
                  { field: 'award_classification' as const, label: 'AWARD CLASSIFICATION', placeholder: 'BSCNSWEA Level 2' },
                ].map(({ field, label, required, placeholder }) => (
                  <div key={field} style={field === 'award_classification' ? { gridColumn: 'span 2' } : {}}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--color-text-tertiary)', marginBottom: '6px' }}>
                      {label}{required && ' *'}
                    </label>
                    <input
                      type={field === 'pay_rate' ? 'number' : 'text'}
                      step={field === 'pay_rate' ? '0.01' : undefined}
                      value={form[field]}
                      onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                      required={required}
                      placeholder={placeholder}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        fontSize: '14px',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-btn)',
                        boxSizing: 'border-box',
                        outline: 'none',
                      }}
                    />
                  </div>
                ))}
              </div>

              {formError && (
                <div style={{ padding: '10px 12px', background: '#FEF2F2', color: '#DC2626', borderRadius: 'var(--radius-btn)', fontSize: '13px', marginBottom: '14px' }}>
                  {formError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: '11px 24px',
                  background: 'var(--color-green)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '14px',
                  border: 'none',
                  borderRadius: 'var(--radius-btn)',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'Adding…' : 'Add Worker'}
              </button>
            </form>
          </div>
        )}

        {/* Workers list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-tertiary)' }}>Loading…</div>
        ) : workers.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '48px',
            background: 'var(--color-bg)',
            border: '1px dashed var(--color-border)',
            borderRadius: 'var(--radius-card)',
            color: 'var(--color-text-tertiary)',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>👷</div>
            <div style={{ fontWeight: 700, marginBottom: '4px' }}>No workers yet</div>
            <div style={{ fontSize: '13px' }}>Add your first worker to get started</div>
          </div>
        ) : (
          <div style={{
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-card)',
            overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)' }}>
                  {['Name', 'Phone', 'Employee ID', 'Pay Rate', 'Classification', 'Status'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left',
                      padding: '10px 16px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: 'var(--color-text-tertiary)',
                      letterSpacing: '0.05em',
                    }}>{h.toUpperCase()}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workers.map((w, i) => (
                  <tr key={w.id} style={{ borderBottom: i < workers.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: '14px' }}>
                      {w.first_name} {w.last_name}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>{w.phone}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>{w.employee_id}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600 }}>
                      ${parseFloat(w.pay_rate).toFixed(2)}/hr
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--color-text-tertiary)' }}>
                      {w.award_classification ?? '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '100px',
                        background: w.is_active ? 'var(--color-green-bg)' : '#FEF2F2',
                        color: w.is_active ? 'var(--color-green-text)' : '#DC2626',
                      }}>
                        {w.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
