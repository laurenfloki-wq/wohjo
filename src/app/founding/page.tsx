/**
 * WOHJO Sprint 6 — /founding page rebuild
 * File location hint: src/app/founding/page.tsx
 *
 * Design tokens per sprint brief (navy + verification green +
 * orange accent + IBM Plex). Build agent: reconcile with the
 * existing homepage token system — if the homepage is already
 * Barlow Condensed + #c8530a amber + #0e0c09 ink, adopt the
 * homepage tokens here instead so the two pages match.
 *
 * Form submission path: Supabase `founding_leads` + decrement
 * `founding_config.spots_remaining` via RPC, plus Resend email
 * to lauren.flosmosis@gmail.com. Server route does the writes —
 * this page posts JSON to /api/founding/submit.
 */
'use client';

import { useEffect, useState, type FC } from 'react';
import { motion } from 'framer-motion';
import { createBrowserClient } from '@supabase/ssr';

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
  mobile: string;
  company: string;
  name: string;
  workers: string;
}

const INITIAL_FORM: FormState = {
  mobile: '',
  company: '',
  name: '',
  workers: '',
};

export default function FoundingPage() {
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null);
  const [foundingNumber, setFoundingNumber] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live spots counter from Supabase founding_config.
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    (async () => {
      const { data } = await supabase
        .from('founding_config')
        .select('spots_remaining')
        .maybeSingle();
      if (data) setSpotsRemaining(data.spots_remaining);
    })();
    // Realtime would be overkill. Poll on mount only.
  }, []);

  const scrollToForm = () => {
    document.getElementById('founding-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/founding/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('submit-failed');
      const json = await res.json();
      setFoundingNumber(json.foundingNumber);
      setSpotsRemaining(json.spotsRemaining);
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Please call Lauren on 0413 573 579.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main style={{ background: PALETTE.navy, color: PALETTE.warm, fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}>
      {/* Announcement banner -------------------------------- */}
      <div
        style={{
          background: PALETTE.amber,
          color: '#fff',
          textAlign: 'center',
          padding: '14px 16px',
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 13,
          letterSpacing: '0.04em',
        }}
      >
        20 founding spots. 60 days free. $399/month locked 3 years. First in — closes when full.
      </div>

      {/* Hero ------------------------------------------------ */}
      <Hero>
        <HeroCopy>
          <HeroHeadline>
            You know when your worker says 9 hours
            <br />
            and your supervisor says 8?
          </HeroHeadline>
          <p
            style={{
              color: PALETTE.amber,
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 20,
              marginTop: 28,
              letterSpacing: '0.02em',
            }}
          >
            FLOSTRUCTION records what both sides agreed.
          </p>
          <p
            style={{
              fontFamily: '"IBM Plex Serif", Georgia, serif',
              fontStyle: 'italic',
              fontSize: 18,
              marginTop: 16,
              color: PALETTE.warm,
            }}
          >
            Permanent. SHA-256 verified. Cannot be changed.
          </p>
        </HeroCopy>
        <HeroReceipt />
      </Hero>

      {/* Proof strip ---------------------------------------- */}
      <ProofStrip />

      {/* How it works --------------------------------------- */}
      <Section title="Three steps. No training. No lock-in.">
        <Steps />
      </Section>

      {/* Before / After ------------------------------------- */}
      <BeforeAfter />

      {/* Proof asset ---------------------------------------- */}
      <Section title="Real shifts. Real receipts. Not a demo.">
        <BigReceipt />
        <p style={{ textAlign: 'center', color: PALETTE.muted, marginTop: 14, fontFamily: '"IBM Plex Mono", monospace', fontSize: 13 }}>
          Since 20 April 2026. Real worker. Real Canberra site.
        </p>
      </Section>

      {/* Founding offer ------------------------------------- */}
      <FoundingOffer
        spotsRemaining={spotsRemaining}
        onScrollToForm={scrollToForm}
      />

      {/* Form ----------------------------------------------- */}
      <section style={{ padding: '80px 20px' }}>
        <div
          id="founding-form"
          style={{
            maxWidth: 560,
            margin: '0 auto',
            padding: 40,
            background: PALETTE.navySoft,
            border: `1px solid ${PALETTE.border}`,
            borderRadius: 6,
          }}
        >
          {!submitted ? (
            <>
              <p style={{ color: PALETTE.amber, fontFamily: '"IBM Plex Mono", monospace', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Secure your founding spot
              </p>
              <p style={{ fontFamily: '"IBM Plex Serif", Georgia, serif', fontStyle: 'italic', color: PALETTE.warm, marginTop: 8, fontSize: 15 }}>
                Joao will call you within 24 hours.
              </p>

              <form onSubmit={handleSubmit} style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <LabeledInput
                  label="Mobile"
                  required
                  placeholder="04XX XXX XXX"
                  value={form.mobile}
                  onChange={(v) => setForm({ ...form, mobile: v })}
                />
                <LabeledInput
                  label="Company name"
                  placeholder="Dass Labour Hire Pty Ltd"
                  value={form.company}
                  onChange={(v) => setForm({ ...form, company: v })}
                />
                <LabeledInput
                  label="Your name"
                  placeholder="Mo Shaaf"
                  value={form.name}
                  onChange={(v) => setForm({ ...form, name: v })}
                />
                <LabeledInput
                  label="Workers on site"
                  type="number"
                  inputMode="numeric"
                  value={form.workers}
                  onChange={(v) => setForm({ ...form, workers: v })}
                />

                <button
                  type="submit"
                  disabled={submitting || !form.mobile}
                  style={{
                    marginTop: 6,
                    width: '100%',
                    height: 56,
                    background: PALETTE.amber,
                    color: '#fff',
                    fontFamily: '"IBM Plex Mono", monospace',
                    fontWeight: 700,
                    fontSize: 16,
                    letterSpacing: '0.04em',
                    border: 'none',
                    borderRadius: 4,
                    cursor: submitting ? 'wait' : 'pointer',
                    opacity: submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? 'Securing your spot…' : 'Secure my founding spot →'}
                </button>

                {error && (
                  <p style={{ color: '#fca5a5', fontFamily: '"IBM Plex Mono", monospace', fontSize: 13 }}>
                    {error}
                  </p>
                )}

                <p style={{ color: PALETTE.warm, fontSize: 13, textAlign: 'center', marginTop: 6 }}>
                  Rather call? Lauren: 0413 573 579
                </p>
              </form>
            </>
          ) : (
            <Confirmation foundingNumber={foundingNumber} />
          )}
        </div>
      </section>

      {/* Final CTA ------------------------------------------ */}
      <FinalCta onScrollToForm={scrollToForm} />

      {/* Footer --------------------------------------------- */}
      <Footer />
    </main>
  );
}

// -------------------- Hero ---------------------------------
const Hero: FC<{ children: React.ReactNode }> = ({ children }) => (
  <section
    style={{
      minHeight: '100vh',
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1fr)',
      alignItems: 'center',
      padding: '80px 20px',
      background:
        'linear-gradient(135deg, #0A0A0A 0%, #0E1C2F 60%, #132238 100%)',
      position: 'relative',
    }}
  >
    <div
      style={{
        maxWidth: 1200,
        width: '100%',
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr)',
        gap: 48,
      }}
      className="founding-hero-grid"
    >
      {children}
    </div>
    <style>{`
      @media (min-width: 960px) {
        .founding-hero-grid {
          grid-template-columns: 1.1fr 0.9fr !important;
          align-items: center;
        }
      }
    `}</style>
  </section>
);

const HeroCopy: FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ maxWidth: 640 }}>{children}</div>
);

const HeroHeadline: FC<{ children: React.ReactNode }> = ({ children }) => (
  <motion.h1
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6 }}
    style={{
      fontFamily: '"IBM Plex Mono", monospace',
      color: PALETTE.warm,
      fontSize: 44,
      lineHeight: 1.1,
      letterSpacing: '-0.01em',
      fontWeight: 700,
      margin: 0,
    }}
  >
    {children}
  </motion.h1>
);

const HeroReceipt: FC = () => (
  <motion.div
    initial={{ opacity: 0, rotate: 4, y: 12 }}
    animate={{ opacity: 1, rotate: 2, y: [0, -4, 0] }}
    transition={{
      opacity: { duration: 0.7 },
      rotate: { duration: 0.7 },
      y: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
    }}
    style={{
      background: PALETTE.navySoft,
      border: `1px solid ${PALETTE.border}`,
      borderRadius: 6,
      padding: 28,
      color: PALETTE.warm,
      fontFamily: '"IBM Plex Mono", monospace',
      fontSize: 13,
      lineHeight: 1.7,
      maxWidth: 420,
      width: '100%',
      justifySelf: 'end',
    }}
  >
    <div style={{ color: PALETTE.muted, fontSize: 11, letterSpacing: '0.12em' }}>FLOSTRUCTION RECEIPT</div>
    <div style={{ color: PALETTE.live, fontSize: 22, fontWeight: 700, marginTop: 6 }}>FSTR-JK5QPAVQ</div>
    <Divider />
    <ReceiptLine k="Worker" v="Steve" />
    <ReceiptLine k="Site" v="Canberra Construction Site" />
    <ReceiptLine k="Date" v="20 April 2026" />
    <Divider />
    <ReceiptLine k="Clock In" v="07:06 AEST (geofence detected)" />
    <ReceiptLine k="Confirmed" v="07:06 AEST" />
    <ReceiptLine k="Clock Out" v="15:47 AEST" />
    <ReceiptLine k="Hours" v="8.75" />
    <ReceiptLine k="Approved" v="16:12 AEST" />
    <Divider />
    <div style={{ color: PALETTE.live }}>Chain Integrity: INTACT</div>
    <div style={{ color: PALETTE.green }}>WLES v1.0 Verified</div>
  </motion.div>
);

const ReceiptLine: FC<{ k: string; v: string }> = ({ k, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
    <span style={{ color: PALETTE.muted }}>{k}</span>
    <span>{v}</span>
  </div>
);

const Divider: FC = () => (
  <div style={{ height: 1, background: PALETTE.border, margin: '10px 0' }} />
);

// -------------------- Proof strip --------------------------
const ProofStrip: FC = () => (
  <section
    style={{
      background: PALETTE.navySoft,
      padding: '32px 20px',
      borderTop: `1px solid ${PALETTE.border}`,
      borderBottom: `1px solid ${PALETTE.border}`,
    }}
  >
    <div
      style={{
        maxWidth: 1100,
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 24,
        textAlign: 'center',
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: 13,
        color: PALETTE.warm,
      }}
    >
      <span>Live on active sites since 20 April 2026</span>
      <span>SHA-256 WLES v1.0 — tamper-evident</span>
      <span>Both sides agreed. Cannot be changed.</span>
    </div>
  </section>
);

// -------------------- Generic Section ----------------------
const Section: FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section style={{ padding: '80px 20px' }}>
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <h2
        style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 28,
          color: PALETTE.warm,
          marginBottom: 36,
          fontWeight: 600,
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  </section>
);

// -------------------- Steps (geofence-aware) ---------------
const Steps: FC = () => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>
    <Step
      n={1}
      title="Phone detects arrival automatically"
      body="Your phone detects when you arrive on site. No action needed at 6am."
    />
    <Step
      n={2}
      title="Supervisor replies YES ALL"
      body="Gets a text at end of day. Replies YES ALL. 30 seconds. Done."
    />
    <Step
      n={3}
      title="Permanent record"
      body="FSTR receipt. SHA-256 sealed. WLES v1.0. Both sides agreed. Cannot be changed."
    />
  </div>
);

const Step: FC<{ n: number; title: string; body: string }> = ({ n, title, body }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-60px' }}
    transition={{ duration: 0.5, delay: n * 0.05 }}
    style={{
      background: PALETTE.navySoft,
      border: `1px solid ${PALETTE.border}`,
      borderRadius: 6,
      padding: 24,
    }}
  >
    <div style={{ color: PALETTE.amber, fontFamily: '"IBM Plex Mono", monospace', fontSize: 12, letterSpacing: '0.12em' }}>
      STEP {n}
    </div>
    <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 17, marginTop: 8, color: PALETTE.warm, fontWeight: 600 }}>
      {title}
    </div>
    <p style={{ fontFamily: '"IBM Plex Serif", Georgia, serif', fontStyle: 'italic', marginTop: 10, color: PALETTE.warm, fontSize: 14 }}>
      {body}
    </p>
  </motion.div>
);

// -------------------- Before / After -----------------------
const BeforeAfter: FC = () => (
  <section style={{ padding: '80px 20px' }}>
    <div
      style={{
        maxWidth: 1100,
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 0,
        borderTop: `1px solid ${PALETTE.live}`,
      }}
    >
      <motion.div
        initial={{ x: -20, opacity: 0 }}
        whileInView={{ x: 0, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        style={{ padding: 32, background: '#0b1320', color: PALETTE.muted, fontFamily: '"IBM Plex Mono", monospace', fontSize: 14 }}
      >
        <p style={{ color: PALETTE.warm, marginBottom: 10 }}>"I worked 9 hours not 8"</p>
        <p style={{ marginBottom: 10 }}>"ask the supervisor"</p>
        <p style={{ marginBottom: 10 }}>"which supervisor?"</p>
        <p style={{ color: PALETTE.muted }}>✓✓✓ (read, not replied)</p>
        <p style={{ marginTop: 14, fontStyle: 'italic', fontFamily: '"IBM Plex Serif", Georgia, serif' }}>
          Dead silence.
        </p>
      </motion.div>
      <motion.div
        initial={{ x: 20, opacity: 0 }}
        whileInView={{ x: 0, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        style={{ padding: 32, background: PALETTE.navySoft, color: PALETTE.warm, fontFamily: '"IBM Plex Mono", monospace', fontSize: 14 }}
      >
        <div style={{ color: PALETTE.live, fontSize: 13, marginBottom: 6 }}>FSTR-JK5QPAVQ</div>
        <div>Joao · 8.75h · 07:06 AEST</div>
        <div>Canberra Construction Site</div>
        <div style={{ marginTop: 14, color: PALETTE.amber }}>Supervisor: YES ALL</div>
        <div style={{ marginTop: 10, color: PALETTE.live }}>✓ VERIFIED</div>
      </motion.div>
    </div>
  </section>
);

// -------------------- Big Receipt --------------------------
const BigReceipt: FC = () => (
  <div
    style={{
      maxWidth: 560,
      margin: '0 auto',
      background: PALETTE.navySoft,
      border: `1px solid ${PALETTE.border}`,
      borderRadius: 6,
      padding: 36,
      color: PALETTE.warm,
      fontFamily: '"IBM Plex Mono", monospace',
      fontSize: 14,
      lineHeight: 1.7,
    }}
  >
    <div style={{ color: PALETTE.muted, fontSize: 12, letterSpacing: '0.12em' }}>FLOSTRUCTION RECEIPT</div>
    <div style={{ color: PALETTE.live, fontSize: 28, fontWeight: 700, marginTop: 6 }}>FSTR-JK5QPAVQ</div>
    <Divider />
    <ReceiptLine k="Worker" v="Steve" />
    <ReceiptLine k="Site" v="Canberra Construction Site" />
    <ReceiptLine k="Date" v="20 April 2026" />
    <ReceiptLine k="Clock In" v="07:06 AEST (geofence detected)" />
    <ReceiptLine k="Clock Out" v="15:47 AEST" />
    <ReceiptLine k="Hours" v="8.75" />
    <Divider />
    <div style={{ color: PALETTE.live }}>Chain Integrity: INTACT</div>
    <div style={{ color: PALETTE.green }}>WLES v1.0 Verified — Approved 16:12 AEST</div>
    <div style={{ fontStyle: 'italic', fontFamily: '"IBM Plex Serif", Georgia, serif', marginTop: 10 }}>
      Both sides agreed.
    </div>
  </div>
);

// -------------------- Founding offer -----------------------
const FoundingOffer: FC<{
  spotsRemaining: number | null;
  onScrollToForm: () => void;
}> = ({ spotsRemaining, onScrollToForm }) => (
  <section
    style={{
      position: 'relative',
      padding: '80px 20px',
      background:
        'linear-gradient(180deg, #0E1C2F 0%, #122236 100%)',
      borderTop: `1px solid ${PALETTE.border}`,
      borderBottom: `1px solid ${PALETTE.border}`,
    }}
  >
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(600px circle at 60% 40%, rgba(200,83,10,0.08), transparent 70%)',
        pointerEvents: 'none',
      }}
    />
    <div style={{ maxWidth: 900, margin: '0 auto', position: 'relative' }}>
      <p style={{ color: PALETTE.amber, fontFamily: '"IBM Plex Mono", monospace', fontSize: 12, letterSpacing: '0.2em' }}>
        FOUNDING CUSTOMER PROGRAMME — 20 SPOTS ONLY
      </p>
      <h2 style={{ fontFamily: '"IBM Plex Mono", monospace', color: PALETTE.warm, fontSize: 56, lineHeight: 1.05, marginTop: 10, fontWeight: 700 }}>
        60 days free.
      </h2>
      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8, fontFamily: '"IBM Plex Mono", monospace', fontSize: 17, color: PALETTE.warm }}>
        <span>$399/month — locked for 3 years.</span>
        <span>Your crew live in 48 hours.</span>
        <span>No credit card. No lock-in.</span>
      </div>
      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        style={{ marginTop: 36, color: PALETTE.amber, fontFamily: '"IBM Plex Mono", monospace', fontSize: 22 }}
      >
        {spotsRemaining === null ? '— of 20 founding spots remaining' : `${spotsRemaining} of 20 founding spots remaining`}
      </motion.p>
      <p style={{ marginTop: 18, fontFamily: '"IBM Plex Serif", Georgia, serif', fontStyle: 'italic', color: PALETTE.warm, fontSize: 15 }}>
        Companies joining after 1 July pay $499/month.
      </p>
      <button
        onClick={onScrollToForm}
        style={{
          marginTop: 32,
          padding: '16px 28px',
          background: PALETTE.amber,
          color: '#fff',
          fontFamily: '"IBM Plex Mono", monospace',
          fontWeight: 700,
          fontSize: 15,
          letterSpacing: '0.05em',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        Secure my spot →
      </button>
    </div>
  </section>
);

// -------------------- Labeled input ------------------------
const LabeledInput: FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}> = ({ label, value, onChange, required, placeholder, type = 'text', inputMode }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 11, letterSpacing: '0.08em', color: PALETTE.muted, textTransform: 'uppercase' }}>
      {label}{required ? ' *' : ''}
    </span>
    <input
      type={type}
      inputMode={inputMode}
      required={required}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: 'rgba(255,255,255,0.06)',
        color: PALETTE.warm,
        padding: '14px 14px',
        fontSize: 15,
        fontFamily: '"IBM Plex Mono", monospace',
        border: `1px solid ${PALETTE.border}`,
        borderRadius: 4,
      }}
    />
  </label>
);

// -------------------- Confirmation -------------------------
const Confirmation: FC<{ foundingNumber: number | null }> = ({ foundingNumber }) => (
  <div style={{ textAlign: 'center' }}>
    <p style={{ color: PALETTE.amber, fontFamily: '"IBM Plex Mono", monospace', fontSize: 56, fontWeight: 700 }}>
      Done.
    </p>
    <p style={{ fontFamily: '"IBM Plex Serif", Georgia, serif', fontStyle: 'italic', color: PALETTE.warm, fontSize: 17, marginTop: 12 }}>
      Joao will call you within 24 hours.
    </p>
    {foundingNumber !== null && (
      <p style={{ color: PALETTE.live, fontFamily: '"IBM Plex Mono", monospace', fontSize: 16, marginTop: 18 }}>
        You're Founding Customer #{foundingNumber}.
      </p>
    )}
  </div>
);

// -------------------- Final CTA ----------------------------
const FinalCta: FC<{ onScrollToForm: () => void }> = ({ onScrollToForm }) => (
  <section style={{ padding: '80px 20px', textAlign: 'center' }}>
    <h3 style={{ fontFamily: '"IBM Plex Mono", monospace', color: PALETTE.warm, fontSize: 34, fontWeight: 700 }}>
      20 spots. First in.
    </h3>
    <p style={{ fontFamily: '"IBM Plex Serif", Georgia, serif', fontStyle: 'italic', color: PALETTE.muted, fontSize: 16, marginTop: 10 }}>
      After 1 July, the price goes up.
    </p>
    <button
      onClick={onScrollToForm}
      style={{
        marginTop: 28,
        padding: '16px 28px',
        background: PALETTE.amber,
        color: '#fff',
        fontFamily: '"IBM Plex Mono", monospace',
        fontWeight: 700,
        fontSize: 15,
        border: 'none',
        borderRadius: 4,
        cursor: 'pointer',
      }}
    >
      Secure my spot →
    </button>
  </section>
);

// -------------------- Footer -------------------------------
const Footer: FC = () => (
  <footer style={{ padding: '24px 16px 40px', textAlign: 'center' }}>
    <div style={{ color: PALETTE.muted, fontFamily: '"IBM Plex Mono", monospace', fontSize: 11, letterSpacing: '0.06em' }}>
      FLOSMOSIS PTY LTD | flosmosis.com | lauren@flosmosis.com.au
    </div>
    <div style={{ color: PALETTE.muted, fontFamily: '"IBM Plex Mono", monospace', fontSize: 11, letterSpacing: '0.06em', marginTop: 6 }}>
      Every hour flows. Every record right.
    </div>
  </footer>
);

/*
 * -----------------------------------------------------------
 * BUILD AGENT RECONCILIATION NOTES
 * -----------------------------------------------------------
 * 1. Server route /api/founding/submit must:
 *    - Insert founding_leads row.
 *    - Decrement founding_config.spots_remaining atomically
 *      via RPC `decrement_founding_spot` (return new value
 *      + assigned founding_number).
 *    - Send Resend email to lauren.flosmosis@gmail.com
 *      with subject "[FOUNDING LEAD] <phone>".
 *    - Return { foundingNumber, spotsRemaining }.
 * 2. If homepage uses Barlow Condensed + #c8530a + #0e0c09,
 *    swap font-family + palette constants here accordingly.
 *    The sprint brief's IBM Plex + navy is aspirational; the
 *    live homepage is source of truth for "matches and
 *    exceeds it."
 * 3. Mobile test at 375px: hero grid collapses to single
 *    column automatically via the media query in <Hero>.
 * 4. framer-motion is already in the tech stack per sprint
 *    brief ("Animations (Framer Motion — already in stack)").
 *    If not installed: pnpm add framer-motion.
 * 5. All images referenced are text-only placeholders; no
 *    broken <Image /> references in this scaffold.
 * -----------------------------------------------------------
 */
