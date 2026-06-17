'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  PageHeader,
  StatusChip,
  SpecimenCard,
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

// Schema: per-field validation messages render inline + announce
// via role="alert" beneath the input.
const WorkerSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required'),
  last_name: z.string().trim().min(1, 'Last name is required'),
  phone: z
    .string()
    .trim()
    .min(1, 'Mobile is required')
    .regex(
      /^(\+61\s?4\d{2}\s?\d{3}\s?\d{3}|04\d{2}\s?\d{3}\s?\d{3})$/,
      'Use a valid Australian mobile (04XX XXX XXX or +61 4XX XXX XXX).',
    ),
  email: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine((v) => !v || z.string().email().safeParse(v).success, {
      message: 'Use a valid email address.',
    }),
  employee_id: z.string().trim().min(1, 'Employee id is required'),
  pay_rate: z
    .string()
    .trim()
    .min(1, 'Pay rate is required')
    .refine((v) => Number.isFinite(parseFloat(v)) && parseFloat(v) > 0, {
      message: 'Pay rate must be a positive number.',
    }),
  award_classification: z.string().optional().or(z.literal('')),
});

type WorkerForm = z.infer<typeof WorkerSchema>;

const FIELDS: Array<{
  field: keyof WorkerForm;
  label: string;
  required?: boolean;
  placeholder: string;
  type?: string;
  span?: boolean;
  autoComplete?: string;
  helper?: string;
}> = [
  {
    field: 'first_name',
    label: 'First name',
    required: true,
    placeholder: 'Joao',
    autoComplete: 'given-name',
  },
  {
    field: 'last_name',
    label: 'Last name',
    required: true,
    placeholder: 'Muniz',
    autoComplete: 'family-name',
  },
  {
    field: 'phone',
    label: 'Mobile',
    required: true,
    placeholder: '04XX XXX XXX',
    type: 'tel',
    autoComplete: 'tel',
    helper: 'Used for SMS sign-in. AU mobile only.',
  },
  { field: 'email', label: 'Email', placeholder: 'Optional', type: 'email', autoComplete: 'email' },
  { field: 'employee_id', label: 'Employee id', required: true, placeholder: 'EMP-001' },
  {
    field: 'pay_rate',
    label: 'Pay rate ($/hour)',
    required: true,
    placeholder: '28.47',
    type: 'number',
  },
  {
    field: 'award_classification',
    label: 'Award classification',
    placeholder: 'BSCNSWEA Level 2',
    span: true,
  },
];

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  // Edit mode: when set, the form is pre-filled and submits a PATCH to
  // /api/command/workers/[id] instead of a create POST. editActive backs
  // the Active toggle that only appears while editing.
  const [editing, setEditing] = useState<Worker | null>(null);
  const [editActive, setEditActive] = useState(true);

  const form = useForm<WorkerForm>({
    resolver: zodResolver(WorkerSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      phone: '',
      email: '',
      employee_id: '',
      pay_rate: '',
      award_classification: '',
    },
    mode: 'onBlur',
  });

  useEffect(() => {
    void loadWorkers();
  }, []);

  async function loadWorkers() {
    setLoading(true);
    const res = await fetch('/api/command/workers');
    const data = (await res.json()) as { workers?: Worker[] };
    setWorkers(data.workers ?? []);
    setLoading(false);
  }

  async function onSubmit(values: WorkerForm) {
    if (editing) {
      const res = await fetch(`/api/command/workers/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          email: values.email || null,
          award_classification: values.award_classification || null,
          is_active: editActive,
        }),
      });
      const data = (await res.json()) as { error?: string; unchanged?: boolean };
      if (!res.ok) {
        form.setError('root', { type: 'server', message: data.error ?? 'Couldn’t save changes' });
        return;
      }
      toast.success(
        data.unchanged
          ? 'No changes to save'
          : `Worker ${values.first_name} ${values.last_name} updated`,
        { description: data.unchanged ? undefined : 'The amendment is logged to the ledger.' },
      );
      closeForm();
      void loadWorkers();
      return;
    }

    const res = await fetch('/api/command/workers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...values,
        email: values.email || undefined,
        award_classification: values.award_classification || undefined,
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      form.setError('root', { type: 'server', message: data.error ?? 'Couldn’t add worker' });
      return;
    }
    toast.success(`Worker ${values.first_name} ${values.last_name} added`, {
      description: `Employee id ${values.employee_id} sealed to the ledger.`,
    });
    closeForm();
    void loadWorkers();
  }

  function startEdit(w: Worker) {
    setEditing(w);
    setEditActive(w.is_active);
    form.clearErrors();
    form.reset({
      first_name: w.first_name,
      last_name: w.last_name,
      phone: w.phone,
      email: w.email ?? '',
      employee_id: w.employee_id,
      pay_rate: w.pay_rate,
      award_classification: w.award_classification ?? '',
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeForm() {
    setEditing(null);
    setShowForm(false);
    form.reset({
      first_name: '',
      last_name: '',
      phone: '',
      email: '',
      employee_id: '',
      pay_rate: '',
      award_classification: '',
    });
  }

  function toggleForm() {
    if (showForm) {
      closeForm();
    } else {
      setEditing(null);
      setShowForm(true);
    }
  }

  const activeCount = workers.filter((w) => w.is_active).length;
  const formErrors = form.formState.errors;

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
            <Button variant={showForm ? 'secondary' : 'primary'} onClick={toggleForm}>
              {showForm ? 'Cancel' : 'Add worker'}
            </Button>
          </div>
        }
      />

      {showForm ? (
        <Card style={{ marginBottom: 'var(--s-5)' }}>
          <CardHeader
            title={
              editing ? `Edit ${editing.first_name} ${editing.last_name}`.trim() : 'Add a worker'
            }
            description={
              editing
                ? 'Update the details below. Every change is logged to the ledger.'
                : 'Required fields are marked with an asterisk.'
            }
          />
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 'var(--s-3)',
                marginBottom: 'var(--s-4)',
              }}
            >
              {FIELDS.map(
                ({ field, label, required, placeholder, type, span, autoComplete, helper }) => {
                  const errId = `worker-form-${field}-err`;
                  const helpId = `worker-form-${field}-help`;
                  const err = formErrors[field]?.message as string | undefined;
                  const described =
                    [err ? errId : null, helper ? helpId : null].filter(Boolean).join(' ') ||
                    undefined;
                  return (
                    <div key={field} style={span ? { gridColumn: 'span 2' } : {}}>
                      <label
                        htmlFor={`worker-form-${field}`}
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
                            <span
                              aria-hidden="true"
                              style={{ color: 'var(--flagged)', marginLeft: 4 }}
                            >
                              *
                            </span>
                            <span className="sr-only"> (required)</span>
                          </>
                        ) : null}
                      </label>
                      <input
                        id={`worker-form-${field}`}
                        type={type ?? 'text'}
                        step={type === 'number' ? '0.01' : undefined}
                        autoComplete={autoComplete}
                        aria-invalid={err ? 'true' : undefined}
                        aria-describedby={described}
                        placeholder={placeholder}
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
                        <div
                          id={errId}
                          role="alert"
                          style={{
                            marginTop: 4,
                            fontSize: 11,
                            color: 'var(--flagged)',
                            letterSpacing: '0.01em',
                          }}
                        >
                          {err}
                        </div>
                      ) : helper ? (
                        <div
                          id={helpId}
                          style={{
                            marginTop: 4,
                            fontSize: 11,
                            color: 'var(--ink-muted)',
                          }}
                        >
                          {helper}
                        </div>
                      ) : null}
                    </div>
                  );
                },
              )}
            </div>

            {formErrors.root ? (
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
                {formErrors.root.message}
              </div>
            ) : null}

            {editing ? (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 'var(--s-4)',
                  fontSize: 'var(--t-sm)',
                  color: 'var(--ink-secondary)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: 'var(--verified)' }}
                />
                Active — can sign in and appear in approvals.
              </label>
            ) : null}

            <div style={{ display: 'flex', gap: 10 }}>
              <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
                {editing ? 'Save changes' : 'Add worker'}
              </Button>
              {editing ? (
                <Button type="button" variant="secondary" onClick={closeForm}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <div style={{ color: 'var(--ink-muted)' }}>Loading…</div>
        </Card>
      ) : workers.length === 0 ? (
        <EmptyState
          title="No workers yet"
          description="Register your first worker to get started."
          action={
            <Button variant="primary" onClick={() => setShowForm(true)}>
              Add worker
            </Button>
          }
        />
      ) : workers.length === 1 ? (
        (() => {
          const w = workers[0];
          return (
            <SpecimenCard
              eyebrow="Worker · single record"
              title={`${w.first_name} ${w.last_name}`.trim() || w.employee_id}
              subtitle={`Employee id ${w.employee_id}`}
              badge={
                <StatusChip kind={w.is_active ? 'verified' : 'neutral'}>
                  {w.is_active ? 'Active' : 'Inactive'}
                </StatusChip>
              }
              fields={[
                { label: 'Mobile', value: w.phone, mono: true },
                { label: 'Pay rate', value: `$${formatDecimal(parseFloat(w.pay_rate), 2)}/h` },
                { label: 'Classification', value: w.award_classification ?? '—' },
                { label: 'MYOB card id', value: w.myob_card_id ?? '—', mono: true },
              ]}
              footer={
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 'var(--s-3)',
                    flexWrap: 'wrap',
                  }}
                >
                  <span>Add another worker to switch to the ledger view.</span>
                  <Button variant="secondary" size="sm" onClick={() => startEdit(w)}>
                    Edit
                  </Button>
                </div>
              }
            />
          );
        })()
      ) : (
        <DataTable<Worker>
          columns={[
            {
              id: 'name',
              header: 'Name',
              render: (w) => (
                <span style={{ color: 'var(--ink)', fontWeight: 500 }}>
                  {w.first_name} {w.last_name}
                </span>
              ),
            },
            { id: 'phone', header: 'Mobile', mono: true, render: (w) => w.phone },
            { id: 'employee_id', header: 'Employee id', mono: true, render: (w) => w.employee_id },
            {
              id: 'pay_rate',
              header: 'Pay rate',
              align: 'right',
              render: (w) => `$${formatDecimal(parseFloat(w.pay_rate), 2)}/h`,
            },
            {
              id: 'classification',
              header: 'Classification',
              render: (w) => w.award_classification ?? null,
            },
            { id: 'myob', header: 'MYOB card', mono: true, render: (w) => w.myob_card_id ?? null },
            {
              id: 'status',
              header: 'Status',
              render: (w) => (
                <StatusChip kind={w.is_active ? 'verified' : 'neutral'} size="sm">
                  {w.is_active ? 'Active' : 'Inactive'}
                </StatusChip>
              ),
            },
            {
              id: 'actions',
              header: '',
              align: 'right',
              render: (w) => (
                <Button variant="ghost" size="sm" onClick={() => startEdit(w)}>
                  Edit
                </Button>
              ),
            },
          ]}
          rows={workers}
          rowKey={(w) => w.id}
          caption={`${pluralise(workers.length, 'worker')} registered`}
          empty={<span>No workers registered.</span>}
        />
      )}
      <p style={{ marginTop: 'var(--s-3)', color: 'var(--ink-muted)', fontSize: 'var(--t-xs)' }}>
        {nounFor(workers.length, 'Worker', 'Workers')} you register here can sign in on the
        FLOSTRUCTION field app using their mobile.
      </p>
    </>
  );
}
