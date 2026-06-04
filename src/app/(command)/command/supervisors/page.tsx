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
  // 2026-05-01 — distinct error state added so an API error renders a
  // clear "Couldn't load supervisors" panel with a retry CTA, instead
  // of silently falling through to the "No supervisors yet" empty state
  // (which is what caused Lauren to observe "0 registered" while the
  // DB had 1 active supervisor — see route.ts header for the schema
  // drift root cause).
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewSupervisorForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => { loadSupervisors(); }, []);

  async function loadSupervisors() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/command/supervisors');
      const data = await res.json() as { supervisors?: Supervisor[]; error?: string };
      if (!res.ok) {
        setLoadError(data.error ?? `Request failed (HTTP ${res.status})`);
        setSupervisors([]);
      } else {
        setSupervisors(data.supervisors ?? []);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Network error');
      setSupervisors([]);
    } finally {
      setLoading(false);
    }
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
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28 }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.18em',
              textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 8,
            }}>Command</div>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700,
              margin: 0, color: 'var(--color-text-primary)',
              letterSpacing: '-0.012em', lineHeight: 1.05,
            }}>Supervisors</h1>
            <p style={{
              fontSize: 14, color: 'var(--color-text-tertiary)', marginTop: 8,
              fontFamily: 'var(--font-sans)',
            }}>
              Supervisors approve shifts via SMS. {supervisors.length} registered.
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              padding: '11px 22px',
              background: showForm ? 'transparent' : 'var(--color-amber)',
              color: showForm ? 'var(--color-text-secondary)' : '#0F0F10',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600, fontSize: 12,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              border: showForm ? '1px solid var(--color-border-strong)' : 'none',
              borderRadius: 'var(--radius-btn)', cursor: 'pointer',
            }}
          >
            {showForm ? 'Cancel' : '+ Add Supervisor'}
          </button>
        </div>

        {showForm && (
          <div style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-card)', padding: 28, marginBottom: 24,
          }}>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600,
              marginBottom: 20, color: 'var(--color-text-primary)',
              letterSpacing: '-0.005em',
            }}>Add supervisor</h2>
            <div style={{
              padding: '12px 14px',
              background: 'rgba(217, 165, 72, 0.10)',
              border: '1px solid rgba(217, 165, 72, 0.30)',
              borderRadius: 'var(--radius-btn)',
              fontSize: 13, color: '#FAEBCF', marginBottom: 18,
              fontFamily: 'var(--font-sans)',
              lineHeight: 1.55,
            }}>
              The supervisor&apos;s mobile number must be registered with Twilio for SMS approval to work.
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                {[
                  { field: 'name' as const, label: 'FULL NAME', required: true, placeholder: 'Alex Smith', span: true },
                  { field: 'phone' as const, label: 'MOBILE (RECEIVES SMS)', required: true, placeholder: '04XX XXX XXX' },
                  { field: 'email' as const, label: 'EMAIL', placeholder: 'optional' },
                ].map(({ field, label, required, placeholder, span }) => (
                  <div key={field} style={span ? { gridColumn: 'span 2' } : {}}>
                    <label htmlFor={`supervisor-form-${field}`} style={{
                      display: 'block', fontFamily: 'var(--font-mono)',
                      fontSize: 10, fontWeight: 600, letterSpacing: '0.16em',
                      color: 'var(--color-text-secondary)', marginBottom: 8,
                    }}>
                      {label}{required && <><span aria-hidden="true" style={{ color: 'var(--color-amber)', marginLeft: 4 }}>*</span><span className="sr-only"> (required)</span></>}
                    </label>
                    <input
                      id={`supervisor-form-${field}`}
                      type={field === 'phone' ? 'tel' : field === 'email' ? 'email' : 'text'}
                      autoComplete={field === 'phone' ? 'tel' : field === 'email' ? 'email' : 'name'}
                      value={form[field]}
                      onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                      required={required}
                      placeholder={placeholder}
                      style={{
                        width: '100%', padding: '11px 14px', fontSize: 14,
                        background: '#0F0F10', color: 'var(--color-text-primary)',
                        border: '1px solid var(--color-border-strong)',
                        borderRadius: 'var(--radius-btn)', boxSizing: 'border-box',
                        outline: 'none', fontFamily: 'var(--font-sans)',
                      }}
                    />
                  </div>
                ))}
              </div>
              {formError && (
                <div role="alert" aria-live="assertive" style={{
                  padding: '12px 14px',
                  background: 'rgba(199, 75, 58, 0.12)',
                  border: '1px solid rgba(199, 75, 58, 0.35)',
                  color: '#F8D7CE', borderRadius: 'var(--radius-btn)',
                  fontSize: 13, marginBottom: 14,
                  fontFamily: 'var(--font-sans)',
                }}>
                  {formError}
                </div>
              )}
              <button type="submit" disabled={submitting} style={{
                padding: '12px 26px', background: 'var(--color-amber)',
                color: '#0F0F10', fontFamily: 'var(--font-mono)',
                fontWeight: 600, fontSize: 12,
                letterSpacing: '0.14em', textTransform: 'uppercase',
                border: 'none', borderRadius: 'var(--radius-btn)',
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.6 : 1,
              }}>
                {submitting ? 'Adding…' : 'Add Supervisor'}
              </button>
            </form>
          </div>
        )}

        {loading ? (
          <div style={{
            textAlign: 'center', padding: 48, color: 'var(--color-text-tertiary)',
            fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.1em',
          }}>Loading…</div>
        ) : loadError ? (
          <div
            role="alert"
            data-testid="supervisors-load-error"
            style={{
              textAlign: 'center', padding: '48px 32px',
              background: 'var(--color-bg-secondary)',
              border: '1px solid rgba(217, 165, 72, 0.55)',
              borderRadius: 'var(--radius-card)',
            }}
          >
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.18em',
              textTransform: 'uppercase', color: 'var(--color-amber)', marginBottom: 12,
            }}>Could not load</div>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600,
              color: 'var(--color-text-primary)', margin: 0, marginBottom: 10,
              letterSpacing: '-0.01em',
            }}>Couldn&apos;t load supervisors</h2>
            <p style={{
              fontSize: 14, color: 'var(--color-text-tertiary)',
              margin: 0, marginBottom: 6, fontFamily: 'var(--font-sans)',
            }}>
              The supervisors list is temporarily unavailable.
            </p>
            <p style={{
              fontSize: 12, color: 'var(--color-text-tertiary)',
              margin: 0, marginBottom: 24,
              fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
            }}>{loadError}</p>
            <button
              onClick={() => loadSupervisors()}
              style={{
                padding: '11px 22px', background: 'var(--color-amber)',
                color: '#0F0F10',
                border: 'none', borderRadius: 'var(--radius-btn)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600, fontSize: 12,
                letterSpacing: '0.14em', textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        ) : supervisors.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '64px 32px',
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-card)',
          }}>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600,
              color: 'var(--color-text-primary)', margin: 0, marginBottom: 10,
              letterSpacing: '-0.01em',
            }}>No supervisors yet</h2>
            <p style={{
              fontSize: 14, color: 'var(--color-text-tertiary)',
              margin: 0, marginBottom: 24, fontFamily: 'var(--font-sans)',
            }}>Add site supervisors to enable SMS shift approval.</p>
            <button
              onClick={() => setShowForm(true)}
              style={{
                padding: '11px 22px', background: 'transparent',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border-strong)',
                borderRadius: 'var(--radius-btn)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600, fontSize: 12,
                letterSpacing: '0.14em', textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              + Add Supervisor
            </button>
          </div>
        ) : (
          <div style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-card)', overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{
                  borderBottom: '1px solid var(--color-border)',
                  background: 'rgba(245, 242, 234, 0.04)',
                }}>
                  {['Name', 'Phone', 'Email', 'Verify Token', 'Status'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '12px 16px',
                      fontFamily: 'var(--font-mono)', fontSize: 10,
                      fontWeight: 600, color: 'var(--color-text-secondary)',
                      letterSpacing: '0.16em', textTransform: 'uppercase',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {supervisors.map((s, i) => (
                  <tr key={s.id} style={{
                    borderBottom: i < supervisors.length - 1 ? '1px solid var(--color-border)' : 'none',
                  }}>
                    <td style={{
                      padding: '14px 16px', fontFamily: 'var(--font-display)',
                      fontWeight: 600, fontSize: 14,
                      color: 'var(--color-text-primary)',
                    }}>{s.name}</td>
                    <td style={{
                      padding: '14px 16px', fontFamily: 'var(--font-mono)',
                      fontSize: 12, color: 'var(--color-text-secondary)',
                    }}>{s.phone}</td>
                    <td style={{
                      padding: '14px 16px', fontSize: 13,
                      color: 'var(--color-text-tertiary)',
                      fontFamily: 'var(--font-sans)',
                    }}>{s.email ?? '—'}</td>
                    <td style={{
                      padding: '14px 16px', fontFamily: 'var(--font-mono)',
                      fontSize: 11, color: 'var(--color-text-tertiary)',
                    }}>
                      {s.verify_token?.substring(0, 8)}…
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontFamily: 'var(--font-mono)', fontSize: 10,
                        fontWeight: 600, padding: '4px 10px', borderRadius: 100,
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                        background: s.is_active ? 'rgba(228, 241, 232, 0.12)' : 'rgba(199, 75, 58, 0.12)',
                        color: s.is_active ? '#E4F1E8' : '#F8D7CE',
                      }}>
                        <span style={{
                          width: 5, height: 5, borderRadius: '50%',
                          background: s.is_active ? 'var(--color-green)' : 'var(--color-warm-red)',
                          display: 'inline-block',
                        }} />
                        {s.is_active ? 'Active' : 'Inactive'}
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
