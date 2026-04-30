/**
 * /get-started — Institutional sign-up surface for FLOSTRUCTION.
 *
 * Strategic-positioning context (2026-04-30 mid-day brief):
 *   - Public landing CTAs ("Get Flostruction") route here, replacing
 *     prior "Join the founding cohort" framing on the public surface.
 *   - /founding lives on as the warm-channel pathway (direct URL only,
 *     reached via intel briefs / referrals / accountant introductions).
 *   - This page is the COLD-CHANNEL institutional entry: $499/month
 *     Standard tier, no scarcity, no "first 20", no countdown.
 *
 * Skeleton vs. full Shape A:
 *   This file ships as the SKELETON variant per the Council-unanimous
 *   "fragile Shape A is worse than skeleton" rule. The skeleton:
 *     - Renders a brand-compliant institutional sign-up surface
 *     - Quotes Standard pricing transparently ($499/month)
 *     - Submits inline to the existing /api/contact endpoint
 *     - Returns a confirmation that a real human follows up to onboard
 *
 *   Full Shape A (deferred to a proper Saturday session) would:
 *     - POST /api/stripe/checkout creating a Stripe Checkout session
 *       (mode: subscription, lookup_key: 'standard-monthly', $499/month)
 *     - Redirect to Stripe-hosted Checkout
 *     - On success_url=/get-started/setting-up?session_id=..., poll
 *       /api/get-started/provisioning-status until the webhook handler
 *       has provisioned the tenant (companies + admins + sites + supervisors)
 *     - ABN/ABR validation (ANZSIC labour-hire codes 7212, 7299, etc.)
 *     - Idempotent webhook handler keyed on stripe_customer_id
 *     - Resend confirmation email via existing /lib/email
 *
 * Substrate gaps that block Shape A today (substrate-DD evidence):
 *   - src/app/api/stripe/checkout — DOES NOT EXIST. Must be built.
 *   - src/app/api/stripe/webhook/route.ts — exists as receiver only.
 *     Needs idempotent tenant-provisioning handler extending it.
 *   - Stripe live-mode 'standard-monthly' lookup_key — must be verified
 *     present in the configured Stripe account before Shape A can ship.
 *   - ABR API integration — credentials may not be provisioned; client-
 *     side regex fallback is acceptable per Council option (b).
 *   - src/app/get-started/setting-up — DOES NOT EXIST. Status-poll page
 *     required for post-Checkout return path.
 *
 * Brand: brand-suite v3 tokens (navy / warm / amber accent / IBM Plex).
 * Same palette as /founding for cohesion with the Foundation Entity
 * positioning, but with confident institutional copy — no urgency strip,
 * no spots counter, no "first 20" framing.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';

const PALETTE = {
  navy: '#0E1C2F',
  navySoft: '#132238',
  green: '#166534',
  live: '#4ade80',
  amber: '#c8530a',
  warm: '#F5F0E8',
  muted: '#a49785',
  border: 'rgba(245,240,232,0.14)',
};

interface FormState {
  name: string;
  company: string;
  role: string;
  email: string;
  phone: string;
  workers: string;
  payrollSystem: string;
  message: string;
}

const INITIAL_FORM: FormState = {
  name: '',
  company: '',
  role: '',
  email: '',
  phone: '',
  workers: '',
  payrollSystem: '',
  message: '',
};

export default function GetStartedPage() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
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
          payroll_system: form.payrollSystem,
          message: form.message,
          source: 'get-started',
        }),
      });
      if (!res.ok) throw new Error('submit-failed');
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Please email support@flosmosis.com or try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputBase: React.CSSProperties = {
    width: '100%',
    background: PALETTE.navySoft,
    border: `1px solid ${PALETTE.border}`,
    color: PALETTE.warm,
    padding: '14px 16px',
    fontSize: 15,
    fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
    borderRadius: 4,
    outline: 'none',
  };

  const labelBase: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontFamily: '"IBM Plex Mono", monospace',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: PALETTE.muted,
    marginBottom: 8,
  };

  return (
    <main style={{ background: PALETTE.navy, color: PALETTE.warm, fontFamily: '"IBM Plex Sans", system-ui, sans-serif', minHeight: '100vh' }}>
      {/* Top bar — minimal, no nav. The page is a destination. */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '24px 48px',
        borderBottom: `1px solid ${PALETTE.border}`,
      }}>
        <Link href="/" style={{
          color: PALETTE.warm,
          textDecoration: 'none',
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 13,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
        }}>
          ← Flostruction
        </Link>
        <div style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 11,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: PALETTE.muted,
        }}>
          Get Started
        </div>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '64px 32px 96px' }}>
        {!submitted ? (
          <>
            {/* Hero block --------------------------------------------- */}
            <div style={{ marginBottom: 56 }}>
              <div style={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 12,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: PALETTE.amber,
                marginBottom: 24,
              }}>
                Standard plan · A$499/month
              </div>
              <h1 style={{
                fontFamily: '"IBM Plex Serif", Georgia, serif',
                fontSize: 'clamp(2.4rem, 5vw, 3.6rem)',
                lineHeight: 1.05,
                fontWeight: 500,
                margin: 0,
                marginBottom: 24,
                letterSpacing: '-0.01em',
              }}>
                Get Flostruction for your team.
              </h1>
              <p style={{
                fontSize: 17,
                lineHeight: 1.7,
                color: PALETTE.muted,
                maxWidth: 580,
                margin: 0,
              }}>
                Verified hours at the point of work. Tamper-evident records. Exports your payroll provider can rely on. Tell us a little about your operation and we&apos;ll set you up — every account onboarded with a real human.
              </p>
            </div>

            {/* Pricing detail ----------------------------------------- */}
            <div style={{
              background: PALETTE.navySoft,
              border: `1px solid ${PALETTE.border}`,
              borderRadius: 6,
              padding: '28px 32px',
              marginBottom: 48,
            }}>
              <div style={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 11,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: PALETTE.muted,
                marginBottom: 12,
              }}>
                What&apos;s included
              </div>
              <ul style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                fontSize: 15,
                lineHeight: 1.85,
                color: PALETTE.warm,
              }}>
                <li>Worker app for unlimited workers on the site you operate</li>
                <li>Supervisor SMS approval workflow</li>
                <li>WLES-sealed permanent records, exportable on request</li>
                <li>Five payroll-provider export formats out of the box</li>
                <li>Onboarding handled by a real person — typically same business day</li>
              </ul>
              <p style={{
                fontSize: 13,
                color: PALETTE.muted,
                marginTop: 20,
                marginBottom: 0,
                lineHeight: 1.6,
              }}>
                Larger operations (75+ workers or 2,000+ shifts/month) move to Growth or Scale tiers — we&apos;ll let you know if that applies before you commit.
              </p>
            </div>

            {/* Inline form -------------------------------------------- */}
            <form onSubmit={handleSubmit} id="get-started-form">
              <h2 style={{
                fontFamily: '"IBM Plex Serif", Georgia, serif',
                fontSize: '1.6rem',
                fontWeight: 500,
                margin: 0,
                marginBottom: 28,
              }}>
                Start your account
              </h2>

              {error && (
                <div style={{
                  background: 'rgba(220, 38, 38, 0.1)',
                  border: '1px solid rgba(220, 38, 38, 0.3)',
                  color: '#fca5a5',
                  padding: '12px 16px',
                  borderRadius: 4,
                  fontSize: 14,
                  marginBottom: 24,
                }}>
                  {error}
                </div>
              )}

              <div style={{ marginBottom: 24 }}>
                <label style={labelBase} htmlFor="name">Name</label>
                <input
                  id="name"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Your name"
                  style={inputBase}
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={labelBase} htmlFor="company">Company</label>
                <input
                  id="company"
                  required
                  value={form.company}
                  onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                  placeholder="Company name"
                  style={inputBase}
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={labelBase} htmlFor="role">Your role</label>
                <select
                  id="role"
                  required
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  style={inputBase}
                >
                  <option value="">Select your role</option>
                  <option value="Site Manager">Site Manager</option>
                  <option value="Labour Hire Company">Labour Hire Company</option>
                  <option value="Payroll / Finance">Payroll / Finance</option>
                  <option value="Project Manager">Project Manager</option>
                  <option value="Business Owner">Business Owner</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={labelBase} htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="you@company.com.au"
                  style={inputBase}
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={labelBase} htmlFor="phone">Phone</label>
                <input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+61 4XX XXX XXX"
                  style={inputBase}
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={labelBase} htmlFor="workers">Workers on site</label>
                <select
                  id="workers"
                  value={form.workers}
                  onChange={(e) => setForm((f) => ({ ...f, workers: e.target.value }))}
                  style={inputBase}
                >
                  <option value="">Select…</option>
                  <option value="1-15">1–15</option>
                  <option value="16-30">16–30</option>
                  <option value="31-60">31–60</option>
                  <option value="60+">60+</option>
                </select>
              </div>

              <div style={{ marginBottom: 32 }}>
                <label style={labelBase} htmlFor="message">
                  Anything we should know? (optional)
                </label>
                <textarea
                  id="message"
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                  placeholder="Site address, payroll provider, start timing — whatever helps us set you up properly."
                  rows={4}
                  style={{ ...inputBase, resize: 'vertical', lineHeight: 1.6 }}
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: '100%',
                  background: PALETTE.amber,
                  color: '#fff',
                  border: 'none',
                  padding: '18px 24px',
                  fontSize: 14,
                  fontFamily: '"IBM Plex Mono", monospace',
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  cursor: submitting ? 'wait' : 'pointer',
                  opacity: submitting ? 0.6 : 1,
                  borderRadius: 4,
                  transition: 'opacity 0.2s',
                }}
              >
                {submitting ? 'Sending…' : 'Set up my account →'}
              </button>

              <p style={{
                fontSize: 12,
                color: PALETTE.muted,
                marginTop: 16,
                lineHeight: 1.6,
                textAlign: 'center',
              }}>
                No payment requested today. We&apos;ll confirm pricing and onboarding logistics on the call before billing starts.
              </p>
            </form>
          </>
        ) : (
          /* Success state ------------------------------------------- */
          <div style={{
            textAlign: 'center',
            padding: '80px 0',
          }}>
            <div style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 12,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: PALETTE.live,
              marginBottom: 24,
            }}>
              Received
            </div>
            <h1 style={{
              fontFamily: '"IBM Plex Serif", Georgia, serif',
              fontSize: 'clamp(2rem, 4vw, 2.8rem)',
              lineHeight: 1.1,
              fontWeight: 500,
              margin: 0,
              marginBottom: 24,
            }}>
              Thanks. We&apos;ll be in touch.
            </h1>
            <p style={{
              fontSize: 17,
              lineHeight: 1.7,
              color: PALETTE.muted,
              maxWidth: 480,
              margin: '0 auto 40px',
            }}>
              You&apos;ll hear from us within one business day with a short call to set up your account and confirm onboarding timing.
            </p>
            <Link href="/" style={{
              color: PALETTE.amber,
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 13,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              textDecoration: 'none',
            }}>
              ← Back to flostruction.com
            </Link>
          </div>
        )}
      </div>

      {/* Footer ------------------------------------------------------- */}
      <footer style={{
        borderTop: `1px solid ${PALETTE.border}`,
        padding: '32px 48px',
        fontSize: 12,
        color: PALETTE.muted,
        textAlign: 'center',
        fontFamily: '"IBM Plex Mono", monospace',
        letterSpacing: '0.04em',
      }}>
        © 2026 FLOSMOSIS PTY LTD (ACN 697 323 925). Flostruction is a product of FLOSMOSIS PTY LTD.
      </footer>
    </main>
  );
}
