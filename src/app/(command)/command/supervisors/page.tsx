'use client';

import { useEffect, useState } from 'react';
import {
  Button, Card, CardHeader, DataTable, EmptyState, PageHeader, StatusChip,
} from '@/components/command/ui';
import { pluralise } from '@/lib/format';

interface Supervisor {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  is_active: boolean;
  // `verify_token` deliberately omitted from the UI surface.
  // The token remains in the API payload for legacy compatibility but
  // is never rendered in the default supervisors view (it was a
  // sensitive-data exposure to display it inline).
  verify_token?: string | null;
}

interface NewSupervisorForm { name: string; phone: string; email: string; }

const emptyForm: NewSupervisorForm = { name: '', phone: '', email: '' };

const FIELDS: { field: keyof NewSupervisorForm; label: string; required?: boolean; placeholder: string; span?: boolean; type?: string; autoComplete?: string }[] = [
  { field: 'name', label: 'Full name', required: true, placeholder: 'Alex Smith', span: true, autoComplete: 'name' },
  { field: 'phone', label: 'Mobile (receives SMS)', required: true, placeholder: '04XX XXX XXX', type: 'tel', autoComplete: 'tel' },
  { field: 'email', label: 'Email', placeholder: 'Optional', type: 'email', autoComplete: 'email' },
];

export default function SupervisorsPage() {
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewSupervisorForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => { void loadSupervisors(); }, []);

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
      setFormError(data.error ?? 'Couldn’t add supervisor');
      setSubmitting(false);
      return;
    }
    setForm(emptyForm);
    setShowForm(false);
    setSubmitting(false);
    void loadSupervisors();
  }

  const activeCount = supervisors.filter((s) => s.is_active).length;

  return (
    <>
      <PageHeader
        title="Supervisors"
        description={`${pluralise(activeCount, 'active supervisor')}. They approve shifts via SMS.`}
        trailing={
          <Button variant="primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : 'Add supervisor'}
          </Button>
        }
      />

      {showForm ? (
        <Card style={{ marginBottom: 'var(--s-5)' }}>
          <CardHeader title="Add a supervisor" description="The mobile must be reachable by Twilio for SMS approval to work." />
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)', marginBottom: 'var(--s-4)' }}>
              {FIELDS.map(({ field, label, required, placeholder, type, span, autoComplete }) => (
                <div key={field} style={span ? { gridColumn: 'span 2' } : {}}>
                  <label
                    htmlFor={`supervisor-form-${field}`}
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
                    id={`supervisor-form-${field}`}
                    type={type ?? 'text'}
                    autoComplete={autoComplete}
                    value={form[field]}
                    onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                    required={required}
                    placeholder={placeholder}
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
                    }}
                  />
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
              {submitting ? 'Adding…' : 'Add supervisor'}
            </Button>
          </form>
        </Card>
      ) : null}

      {loading ? (
        <Card><div style={{ color: 'var(--ink-muted)' }}>Loading…</div></Card>
      ) : loadError ? (
        // CADA: distinct, semantically alert-y error panel. Replaces the
        // earlier raw rgba border with the canonical review semantic
        // tokens (--review / --review-bg / --review-border) so any
        // future palette refresh updates this in one place. role="alert"
        // + data-testid preserved for the supervisors-load-error pin.
        <div
          role="alert"
          data-testid="supervisors-load-error"
          style={{
            background: 'var(--review-bg)',
            border: '1px solid var(--review-border)',
            color: 'var(--review)',
            borderRadius: 'var(--r-md)',
            padding: 'var(--s-5)',
            textAlign: 'center',
          }}
        >
          <h3 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--t-md)', fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>
            Couldn&apos;t load supervisors
          </h3>
          <p style={{ color: 'var(--ink-secondary)', marginBottom: 'var(--s-4)' }}>{loadError}</p>
          <Button variant="primary" onClick={() => void loadSupervisors()}>Retry</Button>
        </div>
      ) : supervisors.length === 0 ? (
        <EmptyState
          title="No supervisors yet"
          description="Add a supervisor so they can confirm shifts by SMS."
          action={<Button variant="primary" onClick={() => setShowForm(true)}>Add supervisor</Button>}
        />
      ) : (
        <DataTable<Supervisor>
          columns={[
            { id: 'name', header: 'Name', render: (s) => (
              <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{s.name}</span>
            ) },
            { id: 'phone', header: 'Mobile', mono: true, render: (s) => s.phone },
            { id: 'email', header: 'Email', render: (s) => s.email ?? null },
            { id: 'status', header: 'Status', render: (s) => (
              <StatusChip kind={s.is_active ? 'verified' : 'neutral'} size="sm">
                {s.is_active ? 'Active' : 'Inactive'}
              </StatusChip>
            ) },
          ]}
          rows={supervisors}
          rowKey={(s) => s.id}
          empty={<span>No supervisors registered.</span>}
        />
      )}
    </>
  );
}
