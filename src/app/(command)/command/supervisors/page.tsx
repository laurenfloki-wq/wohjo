'use client';

import { useEffect, useState } from 'react';
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
import { pluralise } from '@/lib/format';

interface Supervisor {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  is_active: boolean;
  verify_token?: string | null;
}

const SupervisorSchema = z.object({
  name: z.string().trim().min(1, 'Full name is required'),
  phone: z
    .string()
    .trim()
    .min(1, 'Mobile is required')
    .regex(
      /^(\+61\s?4\d{2}\s?\d{3}\s?\d{3}|04\d{2}\s?\d{3}\s?\d{3})$/,
      'Use a valid Australian mobile.',
    ),
  email: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine((v) => !v || z.string().email().safeParse(v).success, {
      message: 'Use a valid email address.',
    }),
});

type SupervisorForm = z.infer<typeof SupervisorSchema>;

const FIELDS: Array<{
  field: keyof SupervisorForm;
  label: string;
  required?: boolean;
  placeholder: string;
  span?: boolean;
  type?: string;
  autoComplete?: string;
  helper?: string;
}> = [
  {
    field: 'name',
    label: 'Full name',
    required: true,
    placeholder: 'Alex Smith',
    span: true,
    autoComplete: 'name',
  },
  {
    field: 'phone',
    label: 'Mobile (receives SMS)',
    required: true,
    placeholder: '04XX XXX XXX',
    type: 'tel',
    autoComplete: 'tel',
    helper: 'Must be reachable by Twilio for SMS approval to work.',
  },
  { field: 'email', label: 'Email', placeholder: 'Optional', type: 'email', autoComplete: 'email' },
];

export default function SupervisorsPage() {
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  // Edit mode: when set, the form is pre-filled and submits a PATCH to
  // /api/command/supervisors/[id] instead of a create POST.
  const [editing, setEditing] = useState<Supervisor | null>(null);
  const [editActive, setEditActive] = useState(true);

  const form = useForm<SupervisorForm>({
    resolver: zodResolver(SupervisorSchema),
    defaultValues: { name: '', phone: '', email: '' },
    mode: 'onBlur',
  });

  useEffect(() => {
    void loadSupervisors();
  }, []);

  async function loadSupervisors() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/command/supervisors');
      const data = (await res.json()) as { supervisors?: Supervisor[]; error?: string };
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

  async function onSubmit(values: SupervisorForm) {
    if (editing) {
      const res = await fetch(`/api/command/supervisors/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          email: values.email || null,
          is_active: editActive,
        }),
      });
      const data = (await res.json()) as { error?: string; unchanged?: boolean };
      if (!res.ok) {
        form.setError('root', { type: 'server', message: data.error ?? 'Couldn’t save changes' });
        return;
      }
      toast.success(data.unchanged ? 'No changes to save' : `Supervisor ${values.name} updated`, {
        description: data.unchanged ? undefined : 'The amendment is logged to the ledger.',
      });
      closeForm();
      void loadSupervisors();
      return;
    }

    const res = await fetch('/api/command/supervisors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...values, email: values.email || undefined }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      form.setError('root', { type: 'server', message: data.error ?? 'Couldn’t add supervisor' });
      return;
    }
    toast.success(`Supervisor ${values.name} added`, {
      description: 'They can now confirm shifts by SMS.',
    });
    closeForm();
    void loadSupervisors();
  }

  function startEdit(s: Supervisor) {
    setEditing(s);
    setEditActive(s.is_active);
    form.clearErrors();
    form.reset({ name: s.name, phone: s.phone, email: s.email ?? '' });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeForm() {
    setEditing(null);
    setShowForm(false);
    form.reset({ name: '', phone: '', email: '' });
  }

  function toggleForm() {
    if (showForm) {
      closeForm();
    } else {
      setEditing(null);
      setShowForm(true);
    }
  }

  const activeCount = supervisors.filter((s) => s.is_active).length;
  const formErrors = form.formState.errors;

  return (
    <>
      <PageHeader
        title="Supervisors"
        description={`${pluralise(activeCount, 'active supervisor')}. They approve shifts via SMS.`}
        trailing={
          <Button variant={showForm ? 'secondary' : 'primary'} onClick={toggleForm}>
            {showForm ? 'Cancel' : 'Add supervisor'}
          </Button>
        }
      />

      {showForm ? (
        <Card style={{ marginBottom: 'var(--s-5)' }}>
          <CardHeader
            title={editing ? `Edit ${editing.name}` : 'Add a supervisor'}
            description={
              editing
                ? 'Update the details below. Every change is logged to the ledger.'
                : 'The mobile must be reachable by Twilio for SMS approval to work.'
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
                  const errId = `supervisor-form-${field}-err`;
                  const helpId = `supervisor-form-${field}-help`;
                  const err = formErrors[field]?.message as string | undefined;
                  const described =
                    [err ? errId : null, helper ? helpId : null].filter(Boolean).join(' ') ||
                    undefined;
                  return (
                    <div key={field} style={span ? { gridColumn: 'span 2' } : {}}>
                      <label
                        htmlFor={`supervisor-form-${field}`}
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
                        id={`supervisor-form-${field}`}
                        type={type ?? 'text'}
                        autoComplete={autoComplete}
                        placeholder={placeholder}
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
                        }}
                      />
                      {err ? (
                        <div
                          id={errId}
                          role="alert"
                          style={{ marginTop: 4, fontSize: 11, color: 'var(--flagged)' }}
                        >
                          {err}
                        </div>
                      ) : helper ? (
                        <div
                          id={helpId}
                          style={{ marginTop: 4, fontSize: 11, color: 'var(--ink-muted)' }}
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
                Active — receives SMS approvals.
              </label>
            ) : null}

            <div style={{ display: 'flex', gap: 10 }}>
              <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
                {editing ? 'Save changes' : 'Add supervisor'}
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
      ) : loadError ? (
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
          <h3
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--t-md)',
              fontWeight: 600,
              color: 'var(--ink)',
              marginBottom: 8,
            }}
          >
            Couldn&apos;t load supervisors
          </h3>
          <p style={{ color: 'var(--ink-secondary)', marginBottom: 'var(--s-4)' }}>{loadError}</p>
          <Button variant="primary" onClick={() => void loadSupervisors()}>
            Retry
          </Button>
        </div>
      ) : supervisors.length === 0 ? (
        <EmptyState
          title="No supervisors yet"
          description="Add a supervisor so they can confirm shifts by SMS."
          action={
            <Button variant="primary" onClick={() => setShowForm(true)}>
              Add supervisor
            </Button>
          }
        />
      ) : supervisors.length === 1 ? (
        (() => {
          const s = supervisors[0];
          return (
            <SpecimenCard
              eyebrow="Supervisor · single record"
              title={s.name}
              subtitle="Approves shifts via SMS"
              badge={
                <StatusChip kind={s.is_active ? 'verified' : 'neutral'}>
                  {s.is_active ? 'Active' : 'Inactive'}
                </StatusChip>
              }
              fields={[
                { label: 'Mobile', value: s.phone, mono: true },
                { label: 'Email', value: s.email ?? '—' },
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
                  <span>Add another to switch to the ledger view.</span>
                  <Button variant="secondary" size="sm" onClick={() => startEdit(s)}>
                    Edit
                  </Button>
                </div>
              }
            />
          );
        })()
      ) : (
        <DataTable<Supervisor>
          columns={[
            {
              id: 'name',
              header: 'Name',
              render: (s) => <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{s.name}</span>,
            },
            { id: 'phone', header: 'Mobile', mono: true, render: (s) => s.phone },
            { id: 'email', header: 'Email', render: (s) => s.email ?? null },
            {
              id: 'status',
              header: 'Status',
              render: (s) => (
                <StatusChip kind={s.is_active ? 'verified' : 'neutral'} size="sm">
                  {s.is_active ? 'Active' : 'Inactive'}
                </StatusChip>
              ),
            },
            {
              id: 'actions',
              header: '',
              align: 'right',
              render: (s) => (
                <Button variant="ghost" size="sm" onClick={() => startEdit(s)}>
                  Edit
                </Button>
              ),
            },
          ]}
          rows={supervisors}
          rowKey={(s) => s.id}
          empty={<span>No supervisors registered.</span>}
        />
      )}
      <p style={{ marginTop: 'var(--s-3)', color: 'var(--ink-muted)', fontSize: 'var(--t-xs)' }}>
        Supervisors receive an SMS at shift end and reply with their YES code to confirm hours.
      </p>
    </>
  );
}
