'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
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

const SiteSchema = z.object({
  name: z.string().trim().min(1, 'Site name is required'),
  site_code: z.string().trim().optional().or(z.literal('')),
  address: z.string().trim().optional().or(z.literal('')),
  geofence_radius_metres: z
    .string()
    .trim()
    .min(1, 'Radius is required')
    .refine((v) => {
      const n = parseInt(v, 10);
      return Number.isFinite(n) && n >= 50 && n <= 1000;
    }, { message: 'Radius must be between 50 m and 1,000 m.' }),
});

type SiteForm = z.infer<typeof SiteSchema>;

const FIELDS: Array<{
  field: keyof SiteForm;
  label: string;
  required?: boolean;
  placeholder: string;
  span?: boolean;
  type?: string;
  helper?: string;
}> = [
  { field: 'name', label: 'Site name', required: true, placeholder: 'Gungahlin Townhouses' },
  { field: 'site_code', label: 'Site code', placeholder: 'GUN-01' },
  { field: 'address', label: 'Address', placeholder: '12 Gungahlin Pl, ACT 2912', span: true },
  { field: 'geofence_radius_metres', label: 'Geofence radius (m)', required: true, placeholder: '200', type: 'number', helper: 'Between 50 m and 1,000 m.' },
];

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const form = useForm<SiteForm>({
    resolver: zodResolver(SiteSchema),
    defaultValues: { name: '', site_code: '', address: '', geofence_radius_metres: '200' },
    mode: 'onBlur',
  });

  useEffect(() => { void loadSites(); }, []);

  async function loadSites() {
    setLoading(true);
    const res = await fetch('/api/command/sites');
    const data = await res.json() as { sites?: Site[] };
    setSites(data.sites ?? []);
    setLoading(false);
  }

  async function onSubmit(values: SiteForm) {
    const res = await fetch('/api/command/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: values.name,
        site_code: values.site_code || undefined,
        address: values.address || undefined,
        geofence_radius_metres: values.geofence_radius_metres,
      }),
    });
    const data = await res.json() as { error?: string };
    if (!res.ok) {
      form.setError('root', { type: 'server', message: data.error ?? 'Couldn’t add site' });
      return;
    }
    toast.success(`Site ${values.name} added`, {
      description: `Geofence sealed at ${values.geofence_radius_metres} m radius.`,
    });
    form.reset();
    setShowForm(false);
    void loadSites();
  }

  const activeCount = sites.filter((s) => s.is_active).length;
  const formErrors = form.formState.errors;

  return (
    <>
      <PageHeader
        title="Sites"
        description={`${pluralise(activeCount, 'active site')}.`}
        trailing={
          <Button
            variant={showForm ? 'secondary' : 'primary'}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? 'Cancel' : 'Add site'}
          </Button>
        }
      />

      {showForm ? (
        <Card style={{ marginBottom: 'var(--s-5)' }}>
          <CardHeader title="Add a site" description="Geofence radius constrains where clock-on counts." />
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)', marginBottom: 'var(--s-4)' }}>
              {FIELDS.map(({ field, label, required, placeholder, span, type, helper }) => {
                const errId = `site-form-${field}-err`;
                const helpId = `site-form-${field}-help`;
                const err = formErrors[field]?.message as string | undefined;
                const described = [err ? errId : null, helper ? helpId : null].filter(Boolean).join(' ') || undefined;
                return (
                  <div key={field} style={span ? { gridColumn: 'span 2' } : {}}>
                    <label
                      htmlFor={`site-form-${field}`}
                      style={{
                        display: 'block',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                        color: 'var(--ink-muted)',
                        marginBottom: 6,
                      }}
                    >
                      {label}
                      {required ? (
                        <>
                          <span aria-hidden="true" style={{ color: 'var(--flagged)', marginLeft: 4 }}>*</span>
                          <span className="sr-only"> (required)</span>
                        </>
                      ) : null}
                    </label>
                    <input
                      id={`site-form-${field}`}
                      type={type ?? 'text'}
                      placeholder={placeholder}
                      min={field === 'geofence_radius_metres' ? 50 : undefined}
                      max={field === 'geofence_radius_metres' ? 1000 : undefined}
                      step={field === 'geofence_radius_metres' ? 10 : undefined}
                      aria-invalid={err ? 'true' : undefined}
                      aria-describedby={described}
                      {...form.register(field)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        fontSize: 'var(--t-base)',
                        background: 'var(--surface)',
                        color: 'var(--ink)',
                        border: `1px solid ${err ? 'var(--flagged)' : 'var(--rule-strong)'}`,
                        borderRadius: 'var(--r-md)',
                        boxSizing: 'border-box',
                        fontFamily: 'var(--font-sans)',
                        fontVariantNumeric: 'tabular-nums lining-nums',
                      }}
                    />
                    {err ? (
                      <div id={errId} role="alert" style={{ marginTop: 4, fontSize: 11, color: 'var(--flagged)' }}>{err}</div>
                    ) : helper ? (
                      <div id={helpId} style={{ marginTop: 4, fontSize: 11, color: 'var(--ink-muted)' }}>{helper}</div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {formErrors.root ? (
              <div role="alert" aria-live="assertive" style={{
                padding: '10px 14px',
                background: 'var(--flagged-bg)',
                border: '1px solid var(--flagged-border)',
                color: 'var(--flagged)',
                borderRadius: 'var(--r-md)',
                fontSize: 'var(--t-sm)',
                marginBottom: 'var(--s-3)',
              }}>{formErrors.root.message}</div>
            ) : null}
            <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Adding…' : 'Add site'}
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
      <p style={{ marginTop: 'var(--s-3)', color: 'var(--ink-muted)', fontSize: 'var(--t-xs)' }}>
        Sites define where clock-on counts. Workers can only clock on inside an active site’s geofence.
      </p>
    </>
  );
}
