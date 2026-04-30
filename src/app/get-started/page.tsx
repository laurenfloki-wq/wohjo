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
 *     - Quotes Standard pricing transparently (A$499/month)
 *     - Submits inline to the existing /api/contact endpoint
 *     - Returns a confirmation that a real human follows up to onboard
 *
 *   Full Shape A (deferred to a proper Saturday session) adds Stripe
 *   Checkout on top of this polished surface — see substrate-DD doc
 *   ~/Desktop/FLOSTRUCTION-Build/shape-a-saturday-prerequisites-2026-04-30.md
 *
 * 2026-04-30 visual polish pass: hero treatment with receipt mockup
 * (the load-bearing visual proof), trust-signals row, "what happens
 * next" timeline. Brand-suite v3 tokens throughout. The conversion
 * destination must clear the visual quality bar set by the public
 * landing — preferably exceed it, since this is the moment of
 * commitment.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FMark } from '@/components/brand/FMark';

const PALETTE = {
  navy: '#0E1C2F',
  navySoft: '#132238',
  navyDeeper: '#0a1622',
  green: '#166534',
  live: '#4ade80',
  amber: '#c8530a',
  warm: '#F5F0E8',
  warmDim: '#e8e2d6',
  muted: '#a49785',
  mutedSoft: '#7d7264',
  border: 'rgba(245,240,232,0.14)',
  borderStrong: 'rgba(245,240,232,0.22)',
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
      // Scroll to top so success state is the first thing seen.
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch {
      setError('Something went wrong. Please email support@flosmosis.com or try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main style={{
      background: PALETTE.navy,
      color: PALETTE.warm,
      fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
      minHeight: '100vh',
    }}>
      <style>{`
        @keyframes flostruction-receipt-float {
          0%, 100% { transform: translateY(0) rotate(2deg); }
          50% { transform: translateY(-6px) rotate(2deg); }
        }
        .flo-receipt { animation: flostruction-receipt-float 6s ease-in-out infinite; }

        /* Mobile: stack hero, receipt below copy. Mobile receipt drops
           the rotation/float for legibility. Form goes full-width. */
        @media (max-width: 880px) {
          .flo-hero-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
          .flo-hero-receipt-col { justify-self: stretch !important; }
          .flo-receipt {
            animation: none !important;
            transform: none !important;
            margin: 0 auto !important;
          }
          .flo-trust-grid { grid-template-columns: 1fr 1fr !important; }
          .flo-timeline { padding: 32px 24px !important; }
          .flo-form-wrap { padding: 32px 20px !important; }
          .flo-pad-edge { padding-left: 20px !important; padding-right: 20px !important; }
        }
        @media (max-width: 520px) {
          .flo-trust-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Top bar — minimal, no nav. ─────────────────────────── */}
      <header
        className="flo-pad-edge"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px 48px',
          borderBottom: `1px solid ${PALETTE.border}`,
        }}
      >
        <Link href="/" style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 12,
          color: PALETTE.warm,
          textDecoration: 'none',
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 13,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
        }}>
          <FMark size={22} colour="on-navy" rails="primary-only" label="Flostruction" />
          <span>Flostruction</span>
        </Link>
        <div style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 11,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: PALETTE.muted,
        }}>
          Get started
        </div>
      </header>

      {!submitted ? (
        <>
          {/* ── HERO — two-column, copy + receipt ──────────────── */}
          <section
            className="flo-pad-edge"
            style={{
              padding: '80px 48px 64px',
              maxWidth: 1180,
              margin: '0 auto',
            }}
          >
            <div
              className="flo-hero-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: '1.1fr 1fr',
                gap: 72,
                alignItems: 'center',
              }}
            >
              {/* Left: copy + price + scroll-CTA */}
              <div>
                <div style={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: 11,
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: PALETTE.amber,
                  marginBottom: 28,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '6px 12px',
                  border: `1px solid ${PALETTE.amber}`,
                  borderRadius: 100,
                  opacity: 0.92,
                }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: PALETTE.amber, display: 'inline-block',
                  }} />
                  Standard plan · A$499/month
                </div>
                <h1 style={{
                  fontFamily: '"IBM Plex Serif", Georgia, serif',
                  fontSize: 'clamp(2.4rem, 5vw, 3.8rem)',
                  lineHeight: 1.04,
                  fontWeight: 500,
                  margin: 0,
                  marginBottom: 28,
                  letterSpacing: '-0.012em',
                  color: PALETTE.warm,
                }}>
                  Verified hours.<br />
                  <span style={{ color: PALETTE.live }}>Permanent records.</span><br />
                  One account away.
                </h1>
                <p style={{
                  fontSize: 17,
                  lineHeight: 1.7,
                  color: PALETTE.warmDim,
                  maxWidth: 540,
                  margin: 0,
                  marginBottom: 32,
                }}>
                  Tell us a little about your operation. We&apos;ll set up your account
                  with a 15-minute call — typically same business day. Your workers
                  can start clocking shifts immediately after.
                </p>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <a
                    href="#start-form"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 10,
                      background: PALETTE.amber,
                      color: '#fff',
                      textDecoration: 'none',
                      padding: '15px 28px',
                      fontFamily: '"IBM Plex Mono", monospace',
                      fontSize: 13,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      fontWeight: 600,
                      borderRadius: 4,
                      transition: 'transform 0.15s, opacity 0.15s',
                    }}
                  >
                    Set up my account →
                  </a>
                  <a
                    href="/#"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 10,
                      color: PALETTE.warmDim,
                      textDecoration: 'none',
                      padding: '15px 22px',
                      fontFamily: '"IBM Plex Mono", monospace',
                      fontSize: 13,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      fontWeight: 600,
                      border: `1px solid ${PALETTE.borderStrong}`,
                      borderRadius: 4,
                    }}
                  >
                    Talk to us first
                  </a>
                </div>
              </div>

              {/* Right: receipt mockup — load-bearing visual proof */}
              <div
                className="flo-hero-receipt-col"
                style={{ justifySelf: 'end', maxWidth: 440, width: '100%' }}
              >
                <div style={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: 11,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: PALETTE.muted,
                  marginBottom: 14,
                  textAlign: 'right',
                }}>
                  What you&apos;re buying ↓
                </div>
                <div
                  className="flo-receipt"
                  style={{
                    background: PALETTE.navySoft,
                    border: `1px solid ${PALETTE.borderStrong}`,
                    borderRadius: 8,
                    padding: 28,
                    color: PALETTE.warm,
                    fontFamily: '"IBM Plex Mono", monospace',
                    fontSize: 13,
                    lineHeight: 1.75,
                    boxShadow: '0 24px 40px -20px rgba(0,0,0,0.5)',
                  }}
                >
                  <div style={{
                    color: PALETTE.muted,
                    fontSize: 10,
                    letterSpacing: '0.18em',
                  }}>
                    FLOSTRUCTION RECEIPT
                  </div>
                  <div style={{
                    color: PALETTE.live,
                    fontSize: 22,
                    fontWeight: 700,
                    marginTop: 6,
                    letterSpacing: '0.04em',
                  }}>
                    FSTR-JK5QPAVQ
                  </div>
                  <Divider />
                  <ReceiptLine k="Worker" v="Steve" />
                  <ReceiptLine k="Site" v="Canberra Construction Site" />
                  <ReceiptLine k="Date" v="20 April 2026" />
                  <Divider />
                  <ReceiptLine k="Clock In" v="07:06 AEST (geofence)" />
                  <ReceiptLine k="Confirmed" v="07:06 AEST" />
                  <ReceiptLine k="Clock Out" v="15:47 AEST" />
                  <ReceiptLine k="Hours" v="8.75" />
                  <ReceiptLine k="Approved" v="16:12 AEST" />
                  <Divider />
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    color: PALETTE.live,
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: PALETTE.live, display: 'inline-block',
                    }} />
                    Chain Integrity: INTACT
                  </div>
                  <div style={{ color: PALETTE.green, marginTop: 4 }}>
                    WLES v1.0 Verified
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── TRUST SIGNALS — institutional anchors ─────────── */}
          <section style={{
            background: PALETTE.navyDeeper,
            borderTop: `1px solid ${PALETTE.border}`,
            borderBottom: `1px solid ${PALETTE.border}`,
            padding: '40px 48px',
          }}>
            <div
              className="flo-trust-grid"
              style={{
                maxWidth: 1180,
                margin: '0 auto',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 36,
              }}
            >
              <TrustSignal
                eyebrow="Foundation Entity"
                line="FLOSMOSIS PTY LTD"
                detail="ACN 697 323 925 · ACT-law governed"
              />
              <TrustSignal
                eyebrow="Open standard"
                line="WLES v1.0"
                detail="Constitution adopted 27 Apr 2026 · royalty-free"
              />
              <TrustSignal
                eyebrow="Tamper-evident"
                line="SHA-256 hash chains"
                detail="Independently verifiable, every shift"
              />
              <TrustSignal
                eyebrow="Australian construction"
                line="Built for the work"
                detail="Worker app · supervisor SMS · payroll exports"
              />
            </div>
          </section>

          {/* ── WHAT'S INCLUDED ────────────────────────────────── */}
          <section
            className="flo-pad-edge"
            style={{
              maxWidth: 980,
              margin: '0 auto',
              padding: '72px 48px 24px',
            }}
          >
            <SectionLabel text="Standard plan · what's included" />
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 24,
              marginTop: 28,
            }}>
              <IncludedItem
                title="Worker app"
                body="Unlimited workers on the site you operate. Phone-OTP sign-in. Offline-capable PWA."
              />
              <IncludedItem
                title="Supervisor SMS"
                body="Daily approval batch sent to the supervisor's phone. No new app to install."
              />
              <IncludedItem
                title="Permanent records"
                body="Every shift sealed to the WLES hash chain at the moment of approval."
              />
              <IncludedItem
                title="Payroll exports"
                body="Five formats out of the box: Employment Hero, Xero, MYOB, Micropay, KeyPay."
              />
            </div>
            <p style={{
              marginTop: 28,
              fontSize: 14,
              lineHeight: 1.7,
              color: PALETTE.mutedSoft,
              maxWidth: 720,
            }}>
              Larger operations (75+ workers or 2,000+ shifts/month) move to Growth or Scale tiers — we&apos;ll let you know if that applies before billing starts.
            </p>
          </section>

          {/* ── WHAT HAPPENS NEXT ──────────────────────────────── */}
          <section
            className="flo-pad-edge"
            style={{
              maxWidth: 980,
              margin: '0 auto',
              padding: '72px 48px 64px',
            }}
          >
            <SectionLabel text="What happens after you submit" />
            <div className="flo-timeline" style={{ marginTop: 28 }}>
              <TimelineStep
                step="1"
                title="A 15-minute call"
                body="We confirm pricing, payroll-export format, and onboarding logistics. Same business day in most cases."
              />
              <TimelineStep
                step="2"
                title="Account provisioned"
                body="Your sites, workers, and supervisors are loaded. Access credentials sent to you within one business day."
              />
              <TimelineStep
                step="3"
                title="First shifts the same day"
                body="Workers receive an SMS sign-in link. They can clock their first shift the day onboarding completes."
              />
              <TimelineStep
                step="4"
                title="Records flow to payroll"
                body="Approved shifts export as CSV in the format your payroll provider expects. No format wrestling."
                last
              />
            </div>
          </section>

          {/* ── FORM ────────────────────────────────────────────── */}
          <section
            id="start-form"
            className="flo-pad-edge"
            style={{
              padding: '40px 48px 96px',
              maxWidth: 720,
              margin: '0 auto',
            }}
          >
            <div
              className="flo-form-wrap"
              style={{
                background: PALETTE.navySoft,
                border: `1px solid ${PALETTE.borderStrong}`,
                borderRadius: 10,
                padding: '48px 48px 40px',
              }}
            >
              <SectionLabel text="Start your account" />
              <h2 style={{
                fontFamily: '"IBM Plex Serif", Georgia, serif',
                fontSize: 'clamp(1.6rem, 3vw, 2rem)',
                fontWeight: 500,
                margin: 0,
                marginTop: 12,
                marginBottom: 8,
                letterSpacing: '-0.01em',
              }}>
                Tell us about your operation.
              </h2>
              <p style={{
                fontSize: 15,
                lineHeight: 1.65,
                color: PALETTE.mutedSoft,
                margin: 0,
                marginBottom: 32,
              }}>
                Fields marked with * are required. We&apos;ll respond within one business day.
              </p>

              {error && (
                <div style={{
                  background: 'rgba(220, 38, 38, 0.12)',
                  border: '1px solid rgba(220, 38, 38, 0.35)',
                  color: '#fca5a5',
                  padding: '14px 18px',
                  borderRadius: 6,
                  fontSize: 14,
                  marginBottom: 24,
                  lineHeight: 1.5,
                }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <FormRow label="Name" required>
                  <FormInput
                    id="name"
                    required
                    value={form.name}
                    onChange={(v) => setForm((f) => ({ ...f, name: v }))}
                    placeholder="Your name"
                  />
                </FormRow>

                <FormRow label="Company" required>
                  <FormInput
                    id="company"
                    required
                    value={form.company}
                    onChange={(v) => setForm((f) => ({ ...f, company: v }))}
                    placeholder="Company name"
                  />
                </FormRow>

                <FormRow label="Your role" required>
                  <FormSelect
                    id="role"
                    required
                    value={form.role}
                    onChange={(v) => setForm((f) => ({ ...f, role: v }))}
                  >
                    <option value="">Select your role…</option>
                    <option value="Site Manager">Site manager</option>
                    <option value="Labour Hire Company">Labour hire company</option>
                    <option value="Payroll / Finance">Payroll / finance</option>
                    <option value="Project Manager">Project manager</option>
                    <option value="Business Owner">Business owner</option>
                    <option value="Other">Other</option>
                  </FormSelect>
                </FormRow>

                <FormRow label="Email" required>
                  <FormInput
                    id="email"
                    type="email"
                    required
                    value={form.email}
                    onChange={(v) => setForm((f) => ({ ...f, email: v }))}
                    placeholder="you@company.com.au"
                  />
                </FormRow>

                <FormRow label="Phone">
                  <FormInput
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
                    placeholder="+61 4XX XXX XXX"
                  />
                </FormRow>

                <FormRow label="Workers on site">
                  <FormSelect
                    id="workers"
                    value={form.workers}
                    onChange={(v) => setForm((f) => ({ ...f, workers: v }))}
                  >
                    <option value="">Select…</option>
                    <option value="1-15">1–15</option>
                    <option value="16-30">16–30</option>
                    <option value="31-60">31–60</option>
                    <option value="60+">60+</option>
                  </FormSelect>
                </FormRow>

                <FormRow label="Anything we should know?">
                  <FormTextarea
                    id="message"
                    value={form.message}
                    onChange={(v) => setForm((f) => ({ ...f, message: v }))}
                    placeholder="Site address, current payroll provider, ideal start timing — whatever helps us set you up properly."
                  />
                </FormRow>

                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    width: '100%',
                    background: submitting ? '#a04a1a' : PALETTE.amber,
                    color: '#fff',
                    border: 'none',
                    padding: '20px 24px',
                    fontSize: 14,
                    fontFamily: '"IBM Plex Mono", monospace',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    cursor: submitting ? 'wait' : 'pointer',
                    opacity: submitting ? 0.7 : 1,
                    borderRadius: 6,
                    marginTop: 12,
                    boxShadow: '0 8px 22px -8px rgba(200, 83, 10, 0.5)',
                    transition: 'opacity 0.15s, box-shadow 0.15s',
                  }}
                >
                  {submitting ? 'Sending…' : 'Set up my account →'}
                </button>

                <p style={{
                  fontSize: 12,
                  color: PALETTE.mutedSoft,
                  marginTop: 18,
                  lineHeight: 1.7,
                  textAlign: 'center',
                }}>
                  No payment requested today. Pricing and onboarding logistics confirmed on the call before billing starts. No spam, no sales scripts.
                </p>
              </form>
            </div>
          </section>
        </>
      ) : (
        /* ── SUCCESS STATE ─────────────────────────────────────── */
        <section
          className="flo-pad-edge"
          style={{
            maxWidth: 720,
            margin: '0 auto',
            padding: '120px 48px',
            textAlign: 'center',
          }}
        >
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '6px 14px',
            border: `1px solid ${PALETTE.live}`,
            borderRadius: 100,
            color: PALETTE.live,
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 11,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            marginBottom: 28,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: PALETTE.live, display: 'inline-block',
            }} />
            Received
          </div>
          <h1 style={{
            fontFamily: '"IBM Plex Serif", Georgia, serif',
            fontSize: 'clamp(2.2rem, 4.5vw, 3.2rem)',
            lineHeight: 1.06,
            fontWeight: 500,
            margin: 0,
            marginBottom: 24,
            letterSpacing: '-0.012em',
          }}>
            Thanks. We&apos;ll be in touch.
          </h1>
          <p style={{
            fontSize: 17,
            lineHeight: 1.7,
            color: PALETTE.warmDim,
            maxWidth: 480,
            margin: '0 auto 40px',
          }}>
            You&apos;ll hear from us within one business day with a 15-minute call to confirm pricing, payroll-export format, and onboarding timing.
          </p>
          <Link href="/" style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            color: PALETTE.amber,
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 13,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            textDecoration: 'none',
          }}>
            ← Back to flostruction.com
          </Link>
        </section>
      )}

      {/* ── FOOTER ──────────────────────────────────────────────── */}
      <footer
        className="flo-pad-edge"
        style={{
          background: PALETTE.navyDeeper,
          borderTop: `1px solid ${PALETTE.border}`,
          padding: '40px 48px',
          fontSize: 12,
          color: PALETTE.mutedSoft,
          textAlign: 'center',
          fontFamily: '"IBM Plex Mono", monospace',
          letterSpacing: '0.04em',
          lineHeight: 1.7,
        }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          Records substrate for the Workforce Ledger Evidentiary Standard (WLES).
          Worker-confirmed on-site. Supervisor-verified by SMS. Permanent, timestamped, exportable.
          <div style={{ marginTop: 10 }}>
            © 2026 FLOSMOSIS PTY LTD (ACN 697 323 925). Flostruction is a product of FLOSMOSIS PTY LTD.
            Time verification platform — does not calculate wages, award entitlements, tax, or superannuation.
          </div>
        </div>
      </footer>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

function ReceiptLine({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ color: PALETTE.muted }}>{k}</span>
      <span style={{ color: PALETTE.warm }}>{v}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: PALETTE.border, margin: '12px 0' }} />;
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{
      fontFamily: '"IBM Plex Mono", monospace',
      fontSize: 11,
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      color: PALETTE.muted,
    }}>
      {text}
    </div>
  );
}

function TrustSignal({ eyebrow, line, detail }: { eyebrow: string; line: string; detail: string }) {
  return (
    <div>
      <div style={{
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: 10,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: PALETTE.amber,
        marginBottom: 8,
      }}>
        {eyebrow}
      </div>
      <div style={{
        fontFamily: '"IBM Plex Serif", Georgia, serif',
        fontSize: 18,
        fontWeight: 500,
        color: PALETTE.warm,
        marginBottom: 6,
        letterSpacing: '-0.005em',
      }}>
        {line}
      </div>
      <div style={{
        fontSize: 12,
        color: PALETTE.mutedSoft,
        lineHeight: 1.55,
        fontFamily: '"IBM Plex Mono", monospace',
      }}>
        {detail}
      </div>
    </div>
  );
}

function IncludedItem({ title, body }: { title: string; body: string }) {
  return (
    <div style={{
      background: PALETTE.navySoft,
      border: `1px solid ${PALETTE.border}`,
      borderRadius: 8,
      padding: '24px 22px',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: PALETTE.live, display: 'inline-block',
        }} />
        <h3 style={{
          fontFamily: '"IBM Plex Serif", Georgia, serif',
          fontSize: 16,
          fontWeight: 500,
          margin: 0,
          color: PALETTE.warm,
        }}>{title}</h3>
      </div>
      <p style={{
        fontSize: 13,
        lineHeight: 1.65,
        color: PALETTE.mutedSoft,
        margin: 0,
      }}>
        {body}
      </p>
    </div>
  );
}

function TimelineStep({
  step, title, body, last,
}: {
  step: string;
  title: string;
  body: string;
  last?: boolean;
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '48px 1fr',
      gap: 24,
      paddingBottom: last ? 0 : 28,
      position: 'relative',
    }}>
      {/* Step number + connecting rule */}
      <div style={{ position: 'relative' }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: `1.5px solid ${PALETTE.amber}`,
          color: PALETTE.amber,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 14,
          fontWeight: 600,
          background: PALETTE.navyDeeper,
        }}>
          {step}
        </div>
        {!last && (
          <div style={{
            position: 'absolute',
            top: 44,
            bottom: -28,
            left: 19.5,
            width: 1,
            background: PALETTE.border,
          }} />
        )}
      </div>
      <div style={{ paddingTop: 6 }}>
        <h3 style={{
          fontFamily: '"IBM Plex Serif", Georgia, serif',
          fontSize: 18,
          fontWeight: 500,
          margin: 0,
          marginBottom: 6,
          color: PALETTE.warm,
          letterSpacing: '-0.005em',
        }}>
          {title}
        </h3>
        <p style={{
          fontSize: 14,
          lineHeight: 1.65,
          color: PALETTE.mutedSoft,
          margin: 0,
        }}>
          {body}
        </p>
      </div>
    </div>
  );
}

function FormRow({ label, required, children }: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 22 }}>
      <label style={{
        display: 'block',
        fontSize: 11,
        fontFamily: '"IBM Plex Mono", monospace',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: PALETTE.muted,
        marginBottom: 8,
      }}>
        {label}{required && <span style={{ color: PALETTE.amber, marginLeft: 4 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const FIELD_BASE: React.CSSProperties = {
  width: '100%',
  background: PALETTE.navyDeeper,
  border: `1px solid ${PALETTE.borderStrong}`,
  color: PALETTE.warm,
  padding: '14px 16px',
  fontSize: 15,
  fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
  borderRadius: 5,
  outline: 'none',
  transition: 'border-color 0.15s',
};

function FormInput({
  id, type = 'text', required, value, onChange, placeholder,
}: {
  id: string;
  type?: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      id={id}
      type={type}
      required={required}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={FIELD_BASE}
      onFocus={(e) => { e.currentTarget.style.borderColor = PALETTE.amber; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = PALETTE.borderStrong; }}
    />
  );
}

function FormSelect({
  id, required, value, onChange, children,
}: {
  id: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      id={id}
      required={required}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...FIELD_BASE, appearance: 'none', cursor: 'pointer' }}
      onFocus={(e) => { e.currentTarget.style.borderColor = PALETTE.amber; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = PALETTE.borderStrong; }}
    >
      {children}
    </select>
  );
}

function FormTextarea({
  id, value, onChange, placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={4}
      style={{ ...FIELD_BASE, resize: 'vertical', lineHeight: 1.6, minHeight: 110 }}
      onFocus={(e) => { e.currentTarget.style.borderColor = PALETTE.amber; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = PALETTE.borderStrong; }}
    />
  );
}
