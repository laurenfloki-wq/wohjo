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
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>Sites</h1>
            <p style={{ fontSize: '14px', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
              {sites.length} active site{sites.length !== 1 ? 's' : ''}
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
            {showForm ? 'Cancel' : '+ Add Site'}
          </button>
        </div>

        {showForm && (
          <div style={{
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-card)',
            padding: '24px',
            marginBottom: '24px',
          }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px', color: 'var(--color-text-primary)' }}>Add Site</h2>
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
                        width: '100%', padding: '9px 12px', fontSize: '14px',
                        border: '1px solid var(--color-border)', borderRadius: 'var(--radius-btn)',
                        boxSizing: 'border-box', outline: 'none',
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
                <div style={{ padding: '10px 12px', background: '#FEF2F2', color: '#DC2626', borderRadius: 'var(--radius-btn)', fontSize: '13px', marginBottom: '14px' }}>
                  {formError}
                </div>
              )}
              <button type="submit" disabled={submitting} style={{
                padding: '11px 24px', background: 'var(--color-green)', color: '#fff',
                fontWeight: 700, fontSize: '14px', border: 'none', borderRadius: 'var(--radius-btn)',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}>
                {submitting ? 'Adding…' : 'Add Site'}
              </button>
            </form>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-tertiary)' }}>Loading…</div>
        ) : sites.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '48px',
            background: 'var(--color-bg)', border: '1px dashed var(--color-border)',
            borderRadius: 'var(--radius-card)', color: 'var(--color-text-tertiary)',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🏗️</div>
            <div style={{ fontWeight: 700, marginBottom: '4px' }}>No sites yet</div>
            <div style={{ fontSize: '13px' }}>Add your first job site to get started</div>
          </div>
        ) : (
          <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)' }}>
                  {['Site Name', 'Code', 'Address', 'Geofence', 'Status'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '0.05em' }}>
                      {h.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sites.map((s, i) => (
                  <tr key={s.id} style={{ borderBottom: i < sites.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: '14px' }}>{s.name}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>{s.site_code ?? '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>{s.address ?? '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px' }}>{s.geofence_radius_metres}m</td>
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
