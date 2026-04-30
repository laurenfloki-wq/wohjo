'use client';

import { useEffect, useState } from 'react';
import CommandNav from '@/components/command/CommandNav';

interface Site {
  id: string;
  name: string;
  address: string | null;
  site_code: string | null;
  geofence_radius_metres: number;
  is_active: boolean;
}

interface NewSiteForm {
  name: string;
  address: string;
  site_code: string;
  geofence_radius_metres: string;
}

const emptyForm: NewSiteForm = { name: '', address: '', site_code: '', geofence_radius_metres: '200' };

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewSiteForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => { loadSites(); }, []);

  async function loadSites() {
    setLoading(true);
    const res = await fetch('/api/command/sites');
    const data = await res.json() as { sites?: Site[] };
    setSites(data.sites ?? []);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    const res = await fetch('/api/command/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json() as { error?: string };
    if (!res.ok) {
      setFormError(data.error ?? 'Failed to add site');
      setSubmitting(false);
      return;
    }
    setForm(emptyForm);
    setShowForm(false);
    setSubmitting(false);
    loadSites();
  }

  return (
    <>
      <CommandNav />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28 }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--color-text-tertiary)',
              marginBottom: 8,
            }}>
              Command
            </div>
            <h1 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 32,
              fontWeight: 700,
              margin: 0,
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.012em',
              lineHeight: 1.05,
            }}>Sites</h1>
            <p style={{
              fontSize: 14,
              color: 'var(--color-text-tertiary)',
              marginTop: 8,
              fontFamily: 'var(--font-sans)',
            }}>
              {sites.length} active site{sites.length !== 1 ? 's' : ''}
            </p>
          </div>
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
            {showForm ? 'Cancel' : '+ Add Site'}
          </button>
        </div>

        {showForm && (
          <div style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-card)',
            padding: 28,
            marginBottom: 24,
          }}>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 18,
              fontWeight: 600,
              marginBottom: 20,
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.005em',
            }}>Add site</h2>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                {[
                  { field: 'name' as const, label: 'SITE NAME', required: true, placeholder: 'Gungahlin Townhouses' },
                  { field: 'site_code' as const, label: 'SITE CODE', placeholder: 'GUN-01' },
                  { field: 'address' as const, label: 'ADDRESS', placeholder: '12 Gungahlin Pl, ACT 2912', span: true },
                  { field: 'geofence_radius_metres' as const, label: 'GEOFENCE RADIUS (m)', placeholder: '200' },
                ].map(({ field, label, required, placeholder, span }) => (
                  <div key={field} style={span ? { gridColumn: 'span 2' } : {}}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--color-text-tertiary)', marginBottom: '6px' }}>
                      {label}{required && ' *'}
                    </label>
                    <input
                      type={field === 'geofence_radius_metres' ? 'number' : 'text'}
                      value={form[field]}
                      onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                      required={required}
                      placeholder={placeholder}
                      // Day 3 P3 — bound geofence radius 50..1000m (matches DB CHECK + Zod).
                      min={field === 'geofence_radius_metres' ? 50 : undefined}
                      max={field === 'geofence_radius_metres' ? 1000 : undefined}
                      step={field === 'geofence_radius_metres' ? 10 : undefined}
                      title={field === 'geofence_radius_metres' ? 'Geofence radius must be between 50m and 1000m' : undefined}
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
                    {field === 'geofence_radius_metres' && (
                      <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                        Between 50m and 1000m. Default 200m.
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {formError && (
                <div style={{
                  padding: '12px 14px',
                  background: 'rgba(199, 75, 58, 0.12)',
                  border: '1px solid rgba(199, 75, 58, 0.35)',
                  color: '#F8D7CE',
                  borderRadius: 'var(--radius-btn)',
                  fontSize: 13,
                  marginBottom: 14,
                  fontFamily: 'var(--font-sans)',
                }}>
                  {formError}
                </div>
              )}
              <button type="submit" disabled={submitting} style={{
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
              }}>
                {submitting ? 'Adding…' : 'Add Site'}
              </button>
            </form>
          </div>
        )}

        {loading ? (
          <div style={{
            textAlign: 'center',
            padding: 48,
            color: 'var(--color-text-tertiary)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            letterSpacing: '0.1em',
          }}>Loading…</div>
        ) : sites.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '64px 32px',
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-card)',
          }}>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              margin: 0,
              marginBottom: 10,
              letterSpacing: '-0.01em',
            }}>No sites yet</h2>
            <p style={{
              fontSize: 14,
              color: 'var(--color-text-tertiary)',
              margin: 0,
              marginBottom: 24,
              fontFamily: 'var(--font-sans)',
            }}>Add your first job site to get started.</p>
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
              + Add Site
            </button>
          </div>
        ) : (
          <div style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-card)',
            overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{
                  borderBottom: '1px solid var(--color-border)',
                  background: 'rgba(245, 242, 234, 0.04)',
                }}>
                  {['Site Name', 'Code', 'Address', 'Geofence', 'Status'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left',
                      padding: '12px 16px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      fontWeight: 600,
                      color: 'var(--color-text-secondary)',
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sites.map((s, i) => (
                  <tr key={s.id} style={{
                    borderBottom: i < sites.length - 1 ? '1px solid var(--color-border)' : 'none',
                  }}>
                    <td style={{
                      padding: '14px 16px',
                      fontFamily: 'var(--font-display)',
                      fontWeight: 600,
                      fontSize: 14,
                      color: 'var(--color-text-primary)',
                    }}>{s.name}</td>
                    <td style={{
                      padding: '14px 16px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      color: 'var(--color-text-secondary)',
                    }}>{s.site_code ?? '—'}</td>
                    <td style={{
                      padding: '14px 16px',
                      fontSize: 13,
                      color: 'var(--color-text-tertiary)',
                      fontFamily: 'var(--font-sans)',
                    }}>{s.address ?? '—'}</td>
                    <td style={{
                      padding: '14px 16px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                      color: 'var(--color-text-primary)',
                    }}>{s.geofence_radius_metres}m</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
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
