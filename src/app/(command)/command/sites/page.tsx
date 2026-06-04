'use client';

import { useEffect, useState } from 'react';
import {
  Button, Card, CardHeader, DataTable, EmptyState, PageHeader, StatusChip, SiteMap,
} from '@/components/command/ui';
import { pluralise, formatInt } from '@/lib/format';

interface Site {
  id: string;
  name: string;
  address: string | null;
  site_code: string | null;
  geofence_radius_metres: number;
  // Supabase returns `numeric` cols as strings over the wire.
  geofence_lat?: string | number | null;
  geofence_lng?: string | number | null;
  lat?: string | number | null;
  lng?: string | number | null;
  is_active: boolean;
}

function toNum(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

interface NewSiteForm {
  name: string;
  address: string;
  site_code: string;
  geofence_radius_metres: string;
}

const emptyForm: NewSiteForm = { name: '', address: '', site_code: '', geofence_radius_metres: '200' };

const FIELDS: { field: keyof NewSiteForm; label: string; required?: boolean; placeholder: string; span?: boolean; type?: string }[] = [
  { field: 'name', label: 'Site name', required: true, placeholder: 'Gungahlin Townhouses' },
  { field: 'site_code', label: 'Site code', placeholder: 'GUN-01' },
  { field: 'address', label: 'Address', placeholder: '12 Gungahlin Pl, ACT 2912', span: true },
  { field: 'geofence_radius_metres', label: 'Geofence radius (m)', placeholder: '200', type: 'number' },
];

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewSiteForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => { void loadSites(); }, []);

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
      setFormError(data.error ?? 'Couldn’t add site');
      setSubmitting(false);
      return;
    }
    setForm(emptyForm);
    setShowForm(false);
    setSubmitting(false);
    void loadSites();
  }

  const activeCount = sites.filter((s) => s.is_active).length;

  return (
    <>
      <PageHeader
        title="Sites"
        description={`${pluralise(activeCount, 'active site')}.`}
        trailing={
          <Button variant="primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : 'Add site'}
          </Button>
        }
      />

      {showForm ? (
        <Card style={{ marginBottom: 'var(--s-5)' }}>
          <CardHeader title="Add a site" description="Geofence radius constrains where clock-on counts." />
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)', marginBottom: 'var(--s-4)' }}>
              {FIELDS.map(({ field, label, required, placeholder, span, type }) => (
                <div key={field} style={span ? { gridColumn: 'span 2' } : {}}>
                  <label
                    htmlFor={`site-form-${field}`}
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 500,
                      color: 'var(--ink-secondary)',
                      letterSpacing: '0.04em',
                      marginBottom: 6,
                    }}
                  >
                    {label}
                    {required ? (
                      <>
                        <span aria-hidden="true" style={{ color: 'var(--accent)', marginLeft: 4 }}>*</span>
                        <span className="sr-only"> (required)</span>
                      </>
                    ) : null}
                  </label>
                  <input
                    id={`site-form-${field}`}
                    type={type ?? 'text'}
                    value={form[field]}
                    onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    required={required}
                    placeholder={placeholder}
                    min={field === 'geofence_radius_metres' ? 50 : undefined}
                    max={field === 'geofence_radius_metres' ? 1000 : undefined}
                    step={field === 'geofence_radius_metres' ? 10 : undefined}
                    aria-describedby={field === 'geofence_radius_metres' ? 'site-form-geofence_radius_metres-hint' : undefined}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: 'var(--t-base)',
                      background: 'var(--surface)',
                      color: 'var(--ink)',
                      border: '1px solid var(--border-strong)',
                      borderRadius: 'var(--r-md)',
                      boxSizing: 'border-box',
                      fontFamily: 'var(--font-sans)',
                      fontVariantNumeric: 'tabular-nums lining-nums',
                    }}
                  />
                  {field === 'geofence_radius_metres' ? (
                    <div id="site-form-geofence_radius_metres-hint" style={{ marginTop: 4, fontSize: 11, color: 'var(--ink-muted)' }}>
                      Between 50 m and 1,000 m. Default 200 m.
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            {formError ? (
              <div role="alert" aria-live="assertive" style={{
                padding: '10px 14px',
                background: 'var(--flagged-bg)',
                border: '1px solid var(--flagged-border)',
                color: 'var(--flagged)',
                borderRadius: 'var(--r-md)',
                fontSize: 'var(--t-sm)',
                marginBottom: 'var(--s-3)',
              }}>{formError}</div>
            ) : null}
            <Button type="submit" variant="primary" loading={submitting}>
              {submitting ? 'Adding…' : 'Add site'}
            </Button>
          </form>
        </Card>
      ) : null}

      {loading ? (
        <Card><div style={{ color: 'var(--ink-muted)' }}>Loading…</div></Card>
      ) : sites.length === 0 ? (
        <EmptyState
          title="No sites yet"
          description="Define a job site so workers can clock on inside its geofence."
          action={<Button variant="primary" onClick={() => setShowForm(true)}>Add site</Button>}
        />
      ) : (
        <DataTable<Site>
          columns={[
            { id: 'name', header: 'Site', render: (s) => (
              <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{s.name}</span>
            ) },
            { id: 'code', header: 'Code', mono: true, render: (s) => s.site_code ?? null },
            { id: 'address', header: 'Address', render: (s) => s.address ?? null },
            { id: 'geofence', header: 'Geofence', render: (s) => {
              const lat = toNum(s.geofence_lat ?? s.lat);
              const lng = toNum(s.geofence_lng ?? s.lng);
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <SiteMap lat={lat} lng={lng} radiusMetres={s.geofence_radius_metres} size={88} />
                  <div>
                    {lat != null && lng != null ? (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)', letterSpacing: '0.04em' }}>
                        {lat.toFixed(4)}°, {lng.toFixed(4)}°
                      </div>
                    ) : (
                      <div style={{ color: 'var(--ink-muted)' }}>—</div>
                    )}
                    <div style={{ color: 'var(--ink-secondary)', fontSize: 'var(--t-sm)', marginTop: 2 }}>
                      Radius <strong style={{ color: 'var(--ink)', fontWeight: 600, fontVariantNumeric: 'tabular-nums lining-nums' }}>{formatInt(s.geofence_radius_metres)} m</strong>
                    </div>
                  </div>
                </div>
              );
            } },
            { id: 'status', header: 'Status', render: (s) => (
              <StatusChip kind={s.is_active ? 'verified' : 'neutral'} size="sm">
                {s.is_active ? 'Active' : 'Inactive'}
              </StatusChip>
            ) },
          ]}
          rows={sites}
          rowKey={(s) => s.id}
          empty={<span>No sites defined.</span>}
        />
      )}
    </>
  );
}
