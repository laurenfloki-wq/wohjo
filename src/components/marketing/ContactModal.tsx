// Lead-capture modal — carried over from the previous landing
// (src/components/shared/LandingPage.tsx:1193-1273, form copy
// verbatim; POST /api/contact payload shape unchanged). Carry-over
// authorised by Lauren 2026-06-10 (brief item (b)): "Book a demo" and
// "Talk to us" open this modal so the /api/contact lead path survives
// the redesign. Restyled with the v5 construction-noir tokens.
'use client';

import { useEffect, useState, type FormEvent } from 'react';

interface FormData {
  name: string;
  company: string;
  role: string;
  email: string;
  phone: string;
  workers: string;
  message: string;
}

const INITIAL_FORM: FormData = {
  name: '', company: '', role: '', email: '', phone: '', workers: '', message: '',
};

interface ContactModalProps {
  open: boolean;
  onClose: () => void;
}

export function ContactModal({ open, onClose }: ContactModalProps) {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(false);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          name: form.name,
          company: form.company,
          role: form.role,
          email: form.email,
          phone: form.phone,
          workers_on_site: form.workers,
          payroll_system: '',
          message: form.message,
        }),
      });
      if (res.ok) setSubmitted(true);
      else throw new Error('Non-OK');
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={open ? 'modal-overlay open' : 'modal-overlay'}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="presentation"
    >
      <div className="modal-box" role="dialog" aria-modal="true" aria-label="Talk to us first">
        <div className="modal-header">
          <h2>Talk to us first</h2>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          {!submitted ? (
            <>
              <p className="modal-intro">
                Tell us a bit about your operation and we&apos;ll come back to you within one business day.
              </p>
              {submitError && (
                <div className="modal-error visible">
                  Something went wrong. Please try again or email us directly at admin@flosmosis.com
                </div>
              )}
              <form onSubmit={handleSubmit}>
                <div className="form-row">
                  <label>Name <span>*</span>
                  <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Your name" /></label>
                </div>
                <div className="form-row">
                  <label>Company <span>*</span>
                  <input required value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} placeholder="Company name" /></label>
                </div>
                <div className="form-row">
                  <label>Your Role <span>*</span>
                  <select required value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                    <option value="">Select your role</option>
                    <option value="Site Manager">Site Manager</option>
                    <option value="Labour Hire Company">Labour Hire Company</option>
                    <option value="Payroll / Finance">Payroll / Finance</option>
                    <option value="Project Manager">Project Manager</option>
                    <option value="Business Owner">Business Owner</option>
                    <option value="Other">Other</option>
                  </select></label>
                </div>
                <div className="form-row">
                  <label>Email <span>*</span>
                  <input required type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="your@email.com" /></label>
                </div>
                <div className="form-row">
                  <label>Phone
                  <input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+61 4XX XXX XXX" /></label>
                </div>
                <div className="form-row">
                  <label>How many workers on site?
                  <select value={form.workers} onChange={(e) => setForm((f) => ({ ...f, workers: e.target.value }))}>
                    <option value="">Select…</option>
                    <option value="1-15">1–15</option>
                    <option value="16-30">16–30</option>
                    <option value="31-60">31–60</option>
                    <option value="60+">60+</option>
                  </select></label>
                </div>
                <div className="form-row">
                  <label>Anything else we should know? (optional)
                  <textarea value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} placeholder="Tell us about your current time tracking challenges…" /></label>
                </div>
                <button type="submit" className="form-submit-btn" disabled={submitting}>
                  {submitting ? 'Sending…' : 'Send →'}
                </button>
                <p className="form-fine">No spam. No sales scripts. Just a straight conversation about whether Flostruction is right for you.</p>
              </form>
            </>
          ) : (
            <div className="success-msg">
              <div className="success-tick">✓</div>
              <h3>You&apos;re on the list.</h3>
              <p>We&apos;ll be in touch within one business day.<br />In the meantime, if you need to reach us directly: <a href="mailto:admin@flosmosis.com">admin@flosmosis.com</a></p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
