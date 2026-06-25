'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { noIdentityErrorMessage } from './auth-messages';

type Step = 'phone' | 'otp' | 'loading';

// After a worker's first successful SMS-verified sign-in, offer passkey
// enrolment ONCE (skippable, re-offerable via /field/passkey). Gated entirely
// behind WORKER_PASSKEY_ACCESS — the credentials endpoint 404s when the flag is
// off, and any failure falls through to /field/home, so the SMS floor is never
// disrupted and enrolment is never mandatory.
async function workerPostLoginDestination(): Promise<string> {
  const HOME = '/field/home';
  try {
    if (
      typeof window !== 'undefined' &&
      window.localStorage.getItem('flos_passkey_offered') === '1'
    ) {
      return HOME; // already offered on this device — don't nag every sign-in
    }
    const res = await fetch('/api/worker/passkey/credentials');
    if (!res.ok) return HOME; // 404 = flag off (or not authorised) → normal flow
    const data = (await res.json().catch(() => ({}))) as { credentials?: unknown[] };
    const enrolled = (data.credentials ?? []).length > 0;
    if (enrolled) return HOME; // already has a passkey — nothing to offer
    try {
      window.localStorage.setItem('flos_passkey_offered', '1');
    } catch {
      // localStorage unavailable (private mode) — still offer; just may re-offer next time
    }
    return '/field/passkey?firstrun=1';
  } catch {
    return HOME;
  }
}

export default function FieldLoginPage() {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const supabase = createClient();

  function formatAustralianPhone(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('0')) return '+61' + digits.slice(1);
    if (digits.startsWith('61')) return '+' + digits;
    if (digits.startsWith('+61')) return digits;
    return '+61' + digits;
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setStep('loading');
    const formatted = formatAustralianPhone(phone);
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone: formatted });
    if (otpError) {
      setError('We couldn\u2019t send the code just now. Wait a minute and try again.');
      setStep('phone');
      return;
    }
    setPhone(formatted);
    setStep('otp');
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setStep('loading');
    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone,
      token: otp,
      type: 'sms',
    });
    if (verifyError) {
      setError('Invalid code. Please try again.');
      setStep('otp');
      return;
    }
    // Fetch worker record via server-side API. Day 5 GAP-A3-002 closure:
    // worker is derived from the session; no phone query param required.
    // Day 6 redesign: first call bootstrap-worker to link auth.users → workers
    // on first OTP. Idempotent — second sign-ins are a no-op server-side.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      // Determine whether this user is a worker or an admin before
      // running role-specific bootstrap logic.
      const roleRes = await fetch('/api/field/role-detect');
      if (!roleRes.ok) {
        const roleJson = (await roleRes.json().catch(() => ({}))) as { code?: string };
        if (roleJson.code === 'NO_IDENTITY') {
          const redirectParam = new URLSearchParams(window.location.search).get('redirect');
          setError(noIdentityErrorMessage(redirectParam));
        } else {
          setError('Could not finish sign-in. Please try again.');
        }
        setStep('phone');
        return;
      }
      const { role } = (await roleRes.json()) as { role: 'worker' | 'admin' };

      if (role === 'admin') {
        // Directors' decision 12 June 2026: the warm-light daily page IS
        // the operator landing. The legacy middleware still stamps
        // ?redirect=/command on the way in — deliberately ignored, or it
        // would route operators back to the superseded charcoal surface.
        window.location.href = '/today';
        return;
      }

      // Worker path — bootstrap to link user_id then enter field app.
      const bootstrap = await fetch('/api/field/bootstrap-worker', { method: 'POST' });
      if (!bootstrap.ok) {
        const bootstrapJson = (await bootstrap.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        if (bootstrapJson.code === 'CONFLICTING_USER_ID') {
          setError(
            'This phone number is already linked to a different account. Please contact support@flosmosis.com.',
          );
        } else {
          setError(bootstrapJson.error ?? 'Could not finish sign-in. Please try again.');
        }
        setStep('phone');
        return;
      }

      window.location.href = await workerPostLoginDestination();
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: '48px', textAlign: 'center' }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '28px',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.5px',
          }}
        >
          Flostruction
        </div>
        <div
          style={{
            fontSize: '13px',
            color: 'var(--color-text-tertiary)',
            marginTop: '4px',
          }}
        >
          Every hour flows. Every pay right.
        </div>
      </div>

      {/* Card */}
      <div
        style={{
          width: '100%',
          maxWidth: '380px',
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-large)',
          padding: '32px',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        {step === 'loading' && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                border: '3px solid var(--color-border)',
                borderTopColor: 'var(--color-green)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto',
              }}
            />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {step === 'phone' && (
          <form onSubmit={handleSendOtp}>
            <h1
              style={{
                fontSize: '20px',
                fontWeight: 700,
                color: 'var(--color-text-primary)',
                marginBottom: '8px',
              }}
            >
              Sign in to Flostruction Field
            </h1>
            <p
              style={{
                fontSize: '14px',
                color: 'var(--color-text-secondary)',
                marginBottom: '24px',
              }}
            >
              Enter your mobile number. We'll send a verification code.
            </p>

            <label
              htmlFor="field-signin-phone"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                marginBottom: '8px',
              }}
            >
              MOBILE NUMBER
            </label>
            <input
              id="field-signin-phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="04XX XXX XXX"
              required
              autoFocus
              inputMode="numeric"
              style={{
                width: '100%',
                padding: '12px 14px',
                fontSize: '16px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-btn)',
                outline: 'none',
                boxSizing: 'border-box',
                marginBottom: error ? '12px' : '20px',
              }}
            />

            {error && (
              <div
                role="alert"
                aria-live="assertive"
                style={{
                  fontSize: '13px',
                  color: '#DC2626',
                  marginBottom: '16px',
                  padding: '10px 12px',
                  background: '#FEF2F2',
                  borderRadius: 'var(--radius-btn)',
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              style={{
                width: '100%',
                padding: '14px',
                minHeight: '48px',
                background: 'var(--color-navy)',
                color: '#fff',
                fontWeight: 700,
                fontSize: '15px',
                border: 'none',
                borderRadius: 'var(--radius-btn)',
                cursor: 'pointer',
              }}
            >
              Send Code
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp}>
            <h1
              style={{
                fontSize: '20px',
                fontWeight: 700,
                color: 'var(--color-text-primary)',
                marginBottom: '8px',
              }}
            >
              Enter your code
            </h1>
            <p
              style={{
                fontSize: '14px',
                color: 'var(--color-text-secondary)',
                marginBottom: '24px',
              }}
            >
              We sent a 6-digit code to {phone}.
            </p>

            <label
              htmlFor="field-signin-otp"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                marginBottom: '8px',
              }}
            >
              VERIFICATION CODE
            </label>
            <input
              id="field-signin-otp"
              type="text"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              required
              autoFocus
              inputMode="numeric"
              maxLength={6}
              style={{
                width: '100%',
                padding: '12px 14px',
                fontSize: '24px',
                letterSpacing: '8px',
                textAlign: 'center',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-btn)',
                outline: 'none',
                boxSizing: 'border-box',
                marginBottom: error ? '12px' : '20px',
                fontFamily: 'var(--font-mono)',
              }}
            />

            {error && (
              <div
                role="alert"
                aria-live="assertive"
                style={{
                  fontSize: '13px',
                  color: '#DC2626',
                  marginBottom: '16px',
                  padding: '10px 12px',
                  background: '#FEF2F2',
                  borderRadius: 'var(--radius-btn)',
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              style={{
                width: '100%',
                padding: '14px',
                minHeight: '48px',
                background: 'var(--color-green)',
                color: '#fff',
                fontWeight: 700,
                fontSize: '15px',
                border: 'none',
                borderRadius: 'var(--radius-btn)',
                cursor: 'pointer',
                marginBottom: '12px',
              }}
            >
              Verify & Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('phone');
                setOtp('');
                setError('');
              }}
              style={{
                width: '100%',
                padding: '13px',
                minHeight: '48px',
                background: 'transparent',
                color: 'var(--color-text-secondary)',
                fontWeight: 600,
                fontSize: '14px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-btn)',
                cursor: 'pointer',
              }}
            >
              Change number
            </button>
          </form>
        )}
      </div>

      {/* Legal footer */}
      <p
        style={{
          fontSize: '11px',
          color: 'rgba(255,255,255,0.4)',
          textAlign: 'center',
          marginTop: '24px',
          lineHeight: 1.5,
        }}
      >
        By signing in you agree to our{' '}
        <a href="/terms" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'underline' }}>
          Terms of Service
        </a>{' '}
        and{' '}
        <a href="/privacy" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'underline' }}>
          Privacy Policy
        </a>
        .
      </p>

      {/* Scope statement — positive-only, describes what FLOSTRUCTION IS. */}
      <p
        style={{
          fontSize: '11px',
          color: 'rgba(255,255,255,0.35)',
          textAlign: 'center',
          marginTop: '8px',
          lineHeight: 1.5,
          maxWidth: '380px',
        }}
      >
        A records system for construction labour hire. Every hour worked, recorded on-site.
      </p>
    </div>
  );
}
