'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Button, Card, CardHeader, DataTable, EmptyState, PageHeader, StatusChip,
} from '@/components/command/ui';
import { pluralise, nounFor, formatDecimal } from '@/lib/format';

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
  myob_card_id?: string | null;
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
  first_name: '', last_name: '', phone: '', email: '',
  employee_id: '', pay_rate: '', award_classification: '',
};

const FIELDS: { field: keyof NewWorkerForm; label: string; required?: boolean; placeholder: string; span?: boolean; type?: string }[] = [
  { field: 'first_name', label: 'First name', required: true, placeholder: 'Joao' },
  { field: 'last_name', label: 'Last name', required: true, placeholder: 'Muniz' },
  { field: 'phone', label: 'Mobile', required: true, placeholder: '04XX XXX XXX', type: 'tel' },
  { field: 'email', label: 'Email', placeholder: 'Optional', type: 'email' },
  { field: 'employee_id', label: 'Employee id', required: true, placeholder: 'EMP-001' },
  { field: 'pay_rate', label: 'Pay rate ($/hour)', required: true, placeholder: '28.47', type: 'number' },
  { field: 'award_classification', label: 'Award classification', placeholder: 'BSCNSWEA Level 2', span: true },
];

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewWorkerForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => { void loadWorkers(); }, []);

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
      setFormError(data.error ?? 'Couldn’t add worker');
      setSubmitting(false);
      return;
    }
    setForm(emptyForm);
    setShowForm(false);
    setSubmitting(false);
    void loadWorkers();
  }

  const activeCount = workers.filter((w) => w.is_active).length;

  return (
    <>
      <PageHeader
        title="Workers"
        description={`${pluralise(activeCount, 'active worker')}.`}
        trailing={
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/command/workers/bulk-upload" style={{ textDecoration: 'none' }}>
              <Button variant="secondary">Bulk upload CSV</Button>
            </Link>
            <Button variant="primary" onClick={() => setShowForm((v) => !v)}>
              {showForm ? 'Cancel' : 'Add worker'}
            </Button>
          </div>
        }
      />

      {showForm ? (
        <Card style={{ marginBottom: 'var(--s-5)' }}>
          <CardHeader title="Add a worker" description="Required fields are marked with an asterisk." />
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)', marginBottom: 'var(--s-4)' }}>
              {FIELDS.map(({ field, label, required, placeholder, type, span }) => (
                <div key={field} style={span ? { gridColumn: 'span 2' } : {}}>
                  <label
                    htmlFor={`worker-form-${field}`}
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
                    id={`worker-form-${field}`}
                    type={type ?? 'text'}
                    step={type === 'number' ? '0.01' : undefined}
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
                      fontVariantNumeric: 'tabular-nums lining-nums',
                    }}
                  />
                </div>
              ))}
            </div>

            {formError ? (
              <div
                role="alert"
                aria-live="assertive"
                style={{
                  padding: '10px 14px',
                  background: 'var(--flagged-bg)',
                  border: '1px solid var(--flagged-border)',
                  color: 'var(--flagged)',
                  borderRadius: 'var(--r-md)',
                  fontSize: 'var(--t-sm)',
                  marginBottom: 'var(--s-3)',
                }}
              >
                {formError}
              </div>
            ) : null}

            <Button type="submit" variant="primary" loading={submitting}>
              {submitting ? 'Adding…' : 'Add worker'}
            </Button>
          </form>
        </Card>
      ) : null}

      {loading ? (
        <Card><div style={{ color: 'var(--ink-muted)' }}>Loading…</div></Card>
      ) : workers.length === 0 ? (
        <EmptyState
          title="No workers yet"
          description="Register your first worker to get started."
          action={<Button variant="primary" onClick={() => setShowForm(true)}>Add worker</Button>}
        />
      ) : (
        <DataTable<Worker>
          columns={[
            { id: 'name', header: 'Name', render: (w) => (
              <span style={{ color: 'var(--ink)', fontWeight: 500 }}>
                {w.first_name} {w.last_name}
              </span>
            ) },
            { id: 'phone', header: 'Mobile', mono: true, render: (w) => w.phone },
            { id: 'employee_id', header: 'Employee id', mono: true, render: (w) => w.employee_id },
            { id: 'pay_rate', header: 'Pay rate', align: 'right', render: (w) => `$${formatDecimal(parseFloat(w.pay_rate), 2)}/h` },
            { id: 'classification', header: 'Classification', render: (w) => w.award_classification ?? null },
            { id: 'myob', header: 'MYOB card', mono: true, render: (w) => w.myob_card_id ?? null },
            { id: 'status', header: 'Status', render: (w) => (
              <StatusChip kind={w.is_active ? 'verified' : 'neutral'} size="sm">
                {w.is_active ? 'Active' : 'Inactive'}
              </StatusChip>
            ) },
          ]}
          rows={workers}
          rowKey={(w) => w.id}
          caption={`${pluralise(workers.length, 'worker')} registered`}
          empty={<span>No workers registered.</span>}
        />
      )}
      <p style={{ marginTop: 'var(--s-3)', color: 'var(--ink-muted)', fontSize: 'var(--t-xs)' }}>
        {nounFor(workers.length, 'Worker', 'Workers')} you register here can sign in on the FLOSTRUCTION field app using their mobile.
      </p>
    </>
  );
}
