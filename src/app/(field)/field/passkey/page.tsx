/**
 * /field/passkey — enrol a passkey for faster sign-in, or sign in with one.
 *
 * Phase A (WORKER_PASSKEY_ACCESS). Flag-gated: when the flag is off, the whole
 * feature is invisible and the worker sees only the permanent SMS floor. When
 * on, the PasskeyManager handles both ceremonies — and the SMS affordance is
 * present on every state of that component. This page never touches
 * shift_events or the WLES chain (auth-only).
 */

import type { Metadata } from 'next';
import { workerPasskeyAccessEnabled } from '@/lib/auth/worker-passkey';
import PasskeyManager from '@/components/field/PasskeyManager';

export const metadata: Metadata = {
  title: 'Passkey sign-in — FLOSTRUCTION',
};

const PAGE: React.CSSProperties = {
  background: '#F5F2EA',
  minHeight: '100vh',
  fontFamily: 'var(--font-inter, "IBM Plex Sans", system-ui, sans-serif)',
  color: '#0E1C2F',
};
const INNER: React.CSSProperties = { maxWidth: 640, margin: '0 auto', padding: '24px 20px 60px' };
const H1: React.CSSProperties = {
  fontFamily: 'var(--font-source-serif, "IBM Plex Serif", Georgia, serif)',
  fontSize: 22,
  fontWeight: 700,
  marginTop: 0,
  marginBottom: '0.8em',
  lineHeight: 1.3,
};

export default function PasskeyPage() {
  const enabled = workerPasskeyAccessEnabled();

  return (
    <div style={PAGE}>
      <div style={INNER}>
        <h1 style={H1}>Faster sign-in</h1>
        {enabled ? (
          <PasskeyManager />
        ) : (
          // Flag off — the floor is all there is. Keep the SMS affordance visible.
          <div
            style={{
              maxWidth: 480,
              margin: '0 auto',
              background: '#FFFFFF',
              border: '1px solid #D9D5CB',
              borderRadius: 12,
              padding: '24px 22px',
            }}
          >
            <p style={{ fontSize: 15, lineHeight: 1.6, margin: '0 0 16px' }}>
              You sign in with your phone number and a one-time SMS code. That is the only way to
              sign in right now.
            </p>
            <a
              href="/field"
              style={{
                color: '#0E1C2F',
                textDecoration: 'underline',
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              Sign in with an SMS code
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
