// Lead capture — the gated upgrade (§2.1 step 4). The instant result above is
// ungated and free; this exchanges contact details for the detailed report and
// the specific steps to close each gap.
//
// JOLT-calibrated (§2.4): ONE clear recommended action, framed to take risk
// off the table — a short, no-obligation conversation, setup done for them.
// APP-compliant (§8.4): explicit consent, a plain statement of what the data
// is used for (a follow-up conversation), and a link to the Privacy Policy.
//
// The actual submit is injected via `submit`, so persistence/integrations
// (slice c) wire in without touching this UI. In the sign-off preview the
// parent injects a stub.

'use client';

import { useState } from 'react';

export interface LeadInput {
  name: string;
  work_email: string;
  company: string;
  role: string;
  phone: string;
  consent: boolean;
}

export interface LeadSubmitResult {
  ok: boolean;
  error?: string;
}

interface Props {
  /** Injected submit — stubbed in preview, real endpoint in slice c. */
  submit: (lead: LeadInput) => Promise<LeadSubmitResult>;
  onStarted?: () => void;
  onCaptured?: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LeadGate({ submit, onStarted, onCaptured }: Props) {
  const [lead, setLead] = useState<LeadInput>({
    name: '',
    work_email: '',
    company: '',
    role: '',
    phone: '',
    consent: false,
  });
  const [touchedOnce, setTouchedOnce] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function set<K extends keyof LeadInput>(key: K, value: LeadInput[K]) {
    if (!touchedOnce) {
      setTouchedOnce(true);
      onStarted?.();
    }
    setLead((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): string | null {
    if (!lead.name.trim()) return 'Please add your name.';
    if (!EMAIL_RE.test(lead.work_email)) return 'Please add a valid work email.';
    if (!lead.company.trim()) return 'Please add your company.';
    if (!lead.consent) return 'Please tick the box so we can send your report and follow up.';
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await submit(lead);
      if (res.ok) {
        setDone(true);
        onCaptured?.();
      } else {
        setError(res.error ?? 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="exposure-gate exposure-animate" aria-live="polite">
        <h3 className="exposure-biggest-title">Thanks — your report is on its way.</h3>
        <p className="exposure-help">
          We&apos;ll send the detailed exposure report and the specific steps to close each gap.
          When you&apos;re ready, the next step is a short, no-obligation walkthrough — 15 minutes,
          and we do the setup for you. No sales scripts.
        </p>
      </div>
    );
  }

  return (
    <div className="exposure-gate">
      <h3 className="exposure-biggest-title">
        Get your detailed exposure report — and the steps to close each gap
      </h3>
      <p className="exposure-help">
        We&apos;ll email the full breakdown plus a short, no-obligation walkthrough offer. We use
        your details only to send the report and follow up about your result. See our{' '}
        <a href="/privacy">Privacy Policy</a>.
      </p>

      <form className="exposure-form" onSubmit={onSubmit} noValidate>
        <div className="exposure-field">
          <label htmlFor="lead-name">Name</label>
          <input
            id="lead-name"
            autoComplete="name"
            value={lead.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </div>
        <div className="exposure-field">
          <label htmlFor="lead-email">Work email</label>
          <input
            id="lead-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={lead.work_email}
            onChange={(e) => set('work_email', e.target.value)}
          />
        </div>
        <div className="exposure-field">
          <label htmlFor="lead-company">Company</label>
          <input
            id="lead-company"
            autoComplete="organization"
            value={lead.company}
            onChange={(e) => set('company', e.target.value)}
          />
        </div>
        <div className="exposure-field">
          <label htmlFor="lead-role">Role</label>
          <input
            id="lead-role"
            autoComplete="organization-title"
            value={lead.role}
            onChange={(e) => set('role', e.target.value)}
          />
        </div>
        <div className="exposure-field exposure-field-full">
          <label htmlFor="lead-phone">Phone (optional)</label>
          <input
            id="lead-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={lead.phone}
            onChange={(e) => set('phone', e.target.value)}
          />
        </div>

        <label className="exposure-consent exposure-field-full" htmlFor="lead-consent">
          <input
            id="lead-consent"
            type="checkbox"
            checked={lead.consent}
            onChange={(e) => set('consent', e.target.checked)}
          />
          <span>
            I agree to FLOSMOSIS using my details to send this report and contact me about my
            result, in line with the <a href="/privacy">Privacy Policy</a>.
          </span>
        </label>

        {error ? (
          <p className="exposure-row-step exposure-field-full" role="alert" style={{ color: 'var(--flagged)' }}>
            {error}
          </p>
        ) : null}

        <div className="exposure-field-full">
          <button
            type="submit"
            className="exposure-cta"
            disabled={submitting}
            style={{
              minHeight: 48,
              width: '100%',
              border: '1px solid var(--primary)',
              borderRadius: 'var(--r-md)',
              background: 'var(--primary)',
              color: 'var(--primary-ink)',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--t-md)',
              fontWeight: 500,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.55 : 1,
            }}
          >
            {submitting ? 'Sending…' : 'Email me the report'}
          </button>
        </div>
      </form>
    </div>
  );
}
