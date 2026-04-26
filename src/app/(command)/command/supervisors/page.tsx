'use client';

import { useEffect, useState } from 'react';
import CommandNav from '@/components/command/CommandNav';

interface Supervisor {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  is_active: boolean;
  verify_token: string | null;
}

interface NewSupervisorForm {
  name: string;
  phone: string;
  email: string;
}

const emptyForm: NewSupervisorForm = { name: '', phone: '', email: '' };

export default function SupervisorsPage() {
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewSupervisorForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => { loadSupervisors(); }, []);

  async function loadSupervisors() {
    setLoading(true);
    const res = await fetch('/api/command/supervisors');
    const data = await res.json() as { supervisors?: Supervisor[] };
    setSupervisors(data.supervisors ?? []);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    const res = await fetch('/api/command/supervisors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json() as { error?: string };
    if (!res.ok) {
      setFormError(data.error ?? 'Failed to add supervisor');
      setSubmitting(false);
      return;
    }
    setForm(emptyForm);
    setShowForm(false);
    setSubmitting(false);
    loadSupervisors();
  }

  return (
    <>
      <CommandNav />
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>Supervisors</h1>
            <p style={{ fontSize: '14px', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
              Supervisors approve shifts via SMS. {supervisors.length} registered.
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              padding: '10px 18px', background: 'var(--color-navy)', color: '#fff',
              fontWeight: 700, fontSize: '14px', border: 'none', borderRadius: 'var(--radius-btn)', cursor: 'pointer',
            }}
          >
            {showForm ? 'Cancel' : '+ Add Supervisor'}
          </button>
        </div>

        {showForm && (
          <div style={{
            background: 'var(--color-bg)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-card)', padding: '24px', marginBottom: '24px',
          }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px', color: 'var(--color-text-primary)' }}>Add Supervisor</h2>
            <div style={{
              padding: '12px 14px', background: 'var(--color-amber-bg)',
              border: '1px solid #FDE68A', borderRadius: 'var(--radius-btn)',
              fontSize: '13px', color: 'var(--color-amber-text)', marginBottom: '16px', fontWeight: 600,
            }}>
              ⚠ The supervisor's mobile number must be registered with Twilio for SMS approval to work.
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                {[
                  { field: 'name' as const, label: 'FULL NAME', required: true, placeholder: 'Alex Smith', span: true },
                  { field: 'phone' as const, label: 'MOBILE (receives SMS)', required: true, placeholder: '04XX XXX XXX' },
                  { field: 'email' as const, label: 'EMAIL', placeholder: 'optional' },
                ].map(({ field, label, required, placeholder, span }) => (
                  <div key={field} style={span ? { gridColumn: 'span 2' } : {}}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--color-text-tertiary)', marginBottom: '6px' }}>
                      {label}{required && ' *'}
                    </label>
                    <input
                      type="text"
                      value={form[field]}
                      onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                      required={required}
                      placeholder={placeholder}
                      style={{
                        width: '100%', padding: '9px 12px', fontSize: '14px',
                        border: '1px solid var(--color-border)', borderRadius: 'var(--radius-btn)',
                        boxSizing: 'border-box', outline: 'none',
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
              <button type="submit" disabled={submitting} style={{
                padding: '11px 24px', background: 'var(--color-green)', color: '#fff',
                fontWeight: 700, fontSize: '14px', border: 'none', borderRadius: 'var(--radius-btn)',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}>
                {submitting ? 'Adding…' : 'Add Supervisor'}
              </button>
            </form>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-tertiary)' }}>Loading…</div>
        ) : supervisors.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '48px',
            background: 'var(--color-bg)', border: '1px dashed var(--color-border)',
            borderRadius: 'var(--radius-card)', color: 'var(--color-text-tertiary)',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>👷‍♀️</div>
            <div style={{ fontWeight: 700, marginBottom: '4px' }}>No supervisors yet</div>
            <div style={{ fontSize: '13px' }}>Add site supervisors to enable SMS shift approval</div>
          </div>
        ) : (
          <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)' }}>
                  {['Name', 'Phone', 'Email', 'Verify Token', 'Status'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '0.05em' }}>
                      {h.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {supervisors.map((s, i) => (
                  <tr key={s.id} style={{ borderBottom: i < supervisors.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: '14px' }}>{s.name}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>{s.phone}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>{s.email ?? '—'}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                      {s.verify_token?.substring(0, 8)}…
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '100px',
                        background: s.is_active ? 'var(--color-green-bg)' : '#FEF2F2',
                        color: s.is_active ? 'var(--color-green-text)' : '#DC2626',
                      }}>{s.is_active ? 'Active' : 'Inactive'}</span>
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
