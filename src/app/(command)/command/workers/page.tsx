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

  useEffect(() => {
    loadWorkers();
  }, []);

  async function loadWorkers() {
    setLoading(true);
    const res = await fetch('/api/command/workers');
    const data = (await res.json()) as { workers?: Worker[] };
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
    const data = (await res.json()) as { error?: string };
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
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: 28,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--color-text-tertiary)',
                marginBottom: 8,
              }}
            >
              Command
            </div>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 32,
                fontWeight: 700,
                margin: 0,
                color: 'var(--color-text-primary)',
                letterSpacing: '-0.012em',
                lineHeight: 1.05,
              }}
            >
              Workers
            </h1>
            <p
              style={{
                fontSize: 14,
                color: 'var(--color-text-tertiary)',
                marginTop: 8,
                fontFamily: 'var(--font-sans)',
              }}
            >
              {workers.length} active worker{workers.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <a
              href="/command/workers/bulk-upload"
              style={{
                padding: '11px 22px',
                background: 'transparent',
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                fontSize: 12,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                border: '1px solid var(--color-border-strong)',
                borderRadius: 'var(--radius-btn)',
                textDecoration: 'none',
              }}
            >
              Bulk upload CSV
            </a>
            <button
              onClick={() => setShowForm(!showForm)}
              style={{
                padding: '11px 22px',
                background: showForm ? 'transparent' : 'var(--color-amber)',
                color: showForm ? 'var(--color-text-secondary)' : '#0F0F10',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                fontSize: 12,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                border: showForm ? '1px solid var(--color-border-strong)' : 'none',
                borderRadius: 'var(--radius-btn)',
                cursor: 'pointer',
              }}
            >
              {showForm ? 'Cancel' : '+ Add Worker'}
            </button>
          </div>
        </div>

        {/* Add Worker Form */}
        {showForm && (
          <div
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-card)',
              padding: 28,
              marginBottom: 24,
            }}
          >
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                fontWeight: 600,
                marginBottom: 20,
                color: 'var(--color-text-primary)',
                letterSpacing: '-0.005em',
              }}
            >
              Add worker
            </h2>
            <form onSubmit={handleSubmit}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 14,
                  marginBottom: 14,
                }}
              >
                {[
                  {
                    field: 'first_name' as const,
                    label: 'FIRST NAME',
                    required: true,
                    placeholder: 'Joao',
                  },
                  {
                    field: 'last_name' as const,
                    label: 'LAST NAME',
                    required: true,
                    placeholder: 'Muniz',
                  },
                  {
                    field: 'phone' as const,
                    label: 'MOBILE',
                    required: true,
                    placeholder: '04XX XXX XXX',
                  },
                  { field: 'email' as const, label: 'EMAIL', placeholder: 'optional' },
                  {
                    field: 'employee_id' as const,
                    label: 'EMPLOYEE ID',
                    required: true,
                    placeholder: 'EMP-001 (Employment Hero)',
                  },
                  {
                    field: 'pay_rate' as const,
                    label: 'PAY RATE ($/hr)',
                    required: true,
                    placeholder: '28.47',
                  },
                  {
                    field: 'award_classification' as const,
                    label: 'AWARD CLASSIFICATION',
                    placeholder: 'BSCNSWEA Level 2',
                  },
                ].map(({ field, label, required, placeholder }) => (
                  <div
                    key={field}
                    style={field === 'award_classification' ? { gridColumn: 'span 2' } : {}}
                  >
                    <label
                      htmlFor={`worker-form-${field}`}
                      style={{
                        display: 'block',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: '0.16em',
                        color: 'var(--color-text-secondary)',
                        marginBottom: 8,
                      }}
                    >
                      {label}
                      {required && (
                        <span style={{ color: 'var(--color-amber)', marginLeft: 4 }} aria-hidden="true">*</span>
                      )}
                      {required && <span className="sr-only"> (required)</span>}
                    </label>
                    <input
                      id={`worker-form-${field}`}
                      type={field === 'pay_rate' ? 'number' : 'text'}
                      step={field === 'pay_rate' ? '0.01' : undefined}
                      value={form[field]}
                      onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                      required={required}
                      placeholder={placeholder}
                      style={{
                        width: '100%',
                        padding: '11px 14px',
                        fontSize: 14,
                        background: '#0F0F10',
                        color: 'var(--color-text-primary)',
                        border: '1px solid var(--color-border-strong)',
                        borderRadius: 'var(--radius-btn)',
                        boxSizing: 'border-box',
                        outline: 'none',
                        fontFamily: 'var(--font-sans)',
                      }}
                    />
                  </div>
                ))}
              </div>

              {formError && (
                <div
                  role="alert"
                  aria-live="assertive"
                  style={{
                    padding: '12px 14px',
                    background: 'rgba(199, 75, 58, 0.12)',
                    border: '1px solid rgba(199, 75, 58, 0.35)',
                    color: '#F8D7CE',
                    borderRadius: 'var(--radius-btn)',
                    fontSize: 13,
                    marginBottom: 14,
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {formError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: '12px 26px',
                  background: 'var(--color-amber)',
                  color: '#0F0F10',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  fontSize: 12,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  border: 'none',
                  borderRadius: 'var(--radius-btn)',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? 'Adding…' : 'Add Worker'}
              </button>
            </form>
          </div>
        )}

        {/* Workers list */}
        {loading ? (
          <div
            style={{
              textAlign: 'center',
              padding: 48,
              color: 'var(--color-text-tertiary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              letterSpacing: '0.1em',
            }}
          >
            Loading…
          </div>
        ) : workers.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '64px 32px',
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-card)',
            }}
          >
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 22,
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                margin: 0,
                marginBottom: 10,
                letterSpacing: '-0.01em',
              }}
            >
              No workers yet
            </h2>
            <p
              style={{
                fontSize: 14,
                color: 'var(--color-text-tertiary)',
                margin: 0,
                marginBottom: 24,
                fontFamily: 'var(--font-sans)',
              }}
            >
              Register your first worker to get started.
            </p>
            <button
              onClick={() => setShowForm(true)}
              style={{
                padding: '11px 22px',
                background: 'transparent',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border-strong)',
                borderRadius: 'var(--radius-btn)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                fontSize: 12,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              + Add Worker
            </button>
          </div>
        ) : (
          <div
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-card)',
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--color-border)',
                    background: 'rgba(245, 242, 234, 0.04)',
                  }}
                >
                  {['Name', 'Phone', 'Employee ID', 'Pay Rate', 'Classification', 'Status'].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: 'left',
                          padding: '12px 16px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 10,
                          fontWeight: 600,
                          color: 'var(--color-text-secondary)',
                          letterSpacing: '0.16em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {workers.map((w, i) => (
                  <tr
                    key={w.id}
                    style={{
                      borderBottom:
                        i < workers.length - 1 ? '1px solid var(--color-border)' : 'none',
                    }}
                  >
                    <td
                      style={{
                        padding: '14px 16px',
                        fontFamily: 'var(--font-display)',
                        fontWeight: 600,
                        fontSize: 14,
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      {w.first_name} {w.last_name}
                    </td>
                    <td
                      style={{
                        padding: '14px 16px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      {w.phone}
                    </td>
                    <td
                      style={{
                        padding: '14px 16px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      {w.employee_id}
                    </td>
                    <td
                      style={{
                        padding: '14px 16px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 13,
                        color: 'var(--color-text-primary)',
                        fontWeight: 600,
                      }}
                    >
                      ${parseFloat(w.pay_rate).toFixed(2)}/hr
                    </td>
                    <td
                      style={{
                        padding: '14px 16px',
                        fontSize: 13,
                        color: 'var(--color-text-tertiary)',
                        fontFamily: 'var(--font-sans)',
                      }}
                    >
                      {w.award_classification ?? '—'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontFamily: 'var(--font-mono)',
                          fontSize: 10,
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: 100,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          background: w.is_active
                            ? 'rgba(228, 241, 232, 0.12)'
                            : 'rgba(199, 75, 58, 0.12)',
                          color: w.is_active ? '#E4F1E8' : '#F8D7CE',
                        }}
                      >
                        <span
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: '50%',
                            background: w.is_active
                              ? 'var(--color-green)'
                              : 'var(--color-warm-red)',
                            display: 'inline-block',
                          }}
                        />
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
