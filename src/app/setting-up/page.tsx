// Saturday Shape A — Task A4: /setting-up onboarding hold page.
//
// Stripe Checkout success_url redirects here with the session_id query
// param. The page polls /api/onboarding/status every 5s waiting for
// the webhook handler to finish provisioning. On success, redirects
// to /command/dashboard.
//
// Canonical mockup palette (charcoal #0F0F10 surface, cream #F5F2EA
// primary text, mockup amber #D9A548 primary CTA, forest #2D5F3F
// confirmation accent, warm-red #C74B3A error accent).
//
// Hold-timeout behaviour: after 60s with no ready/failed terminal
// state, render the hold-timeout state with a Retry CTA. Per Friday
// founder decision, the proposed copy is "We're still processing your
// payment — your tenant will be ready in a few minutes. If this
// persists, reply to this email and we'll sort it manually." Lauren
// reviews + finalises Sunday.

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const POLL_INTERVAL_MS = 5_000;
const HOLD_TIMEOUT_MS = 60_000;

type ProvisionStatus = 'pending' | 'ready' | 'failed' | 'timeout' | 'missing-session';

interface StatusResponse {
  status: 'pending' | 'ready' | 'failed';
  company_id?: string;
  message?: string;
}

export default function SettingUpPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams?.get('session_id');

  const [status, setStatus] = useState<ProvisionStatus>(
    sessionId ? 'pending' : 'missing-session',
  );
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [pollCount, setPollCount] = useState(0);

  useEffect(() => {
    if (!sessionId) return;
    const startedAt = Date.now();
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(
          `/api/onboarding/status?session_id=${encodeURIComponent(sessionId)}`,
          { cache: 'no-store' },
        );
        const data = (await res.json().catch(() => ({}))) as StatusResponse;
        if (cancelled) return;
        setPollCount((n) => n + 1);

        if (data.status === 'ready') {
          setStatus('ready');
          // Redirect after a brief moment so the user sees "Ready"
          setTimeout(() => router.push('/command/dashboard'), 600);
          return;
        }
        if (data.status === 'failed') {
          setStatus('failed');
          setErrorMessage(data.message ?? 'Provisioning failed. Please reply to the welcome email.');
          return;
        }
        // Still pending — check timeout, then re-schedule.
        if (Date.now() - startedAt > HOLD_TIMEOUT_MS) {
          setStatus('timeout');
          return;
        }
        timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        // Network error — re-poll until timeout.
        if (!cancelled) {
          timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [sessionId, router]);

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={eyebrowStyle}>{labelFor(status)}</div>
        <h1 style={headlineStyle}>{titleFor(status)}</h1>
        {status === 'pending' && (
          <>
            <p style={bodyStyle}>
              Your payment is in. We&rsquo;re creating your tenant
              substrate, your /command dashboard, and your first admin
              account. This usually takes a few seconds.
            </p>
            <p style={mutedStyle}>
              Status check #{pollCount + 1} &middot; checking every 5
              seconds
            </p>
          </>
        )}
        {status === 'ready' && (
          <p style={bodyStyle} data-testid="setting-up-ready">
            Ready. Redirecting to your /command dashboard&hellip;
          </p>
        )}
        {status === 'failed' && (
          <>
            <p style={bodyStyle} data-testid="setting-up-failed">
              {errorMessage}
            </p>
            <a
              href="mailto:standards@flosmosis.com?subject=Provisioning%20issue"
              style={ctaStyle}
            >
              Email us
            </a>
          </>
        )}
        {status === 'timeout' && (
          <>
            <p style={bodyStyle} data-testid="setting-up-timeout">
              We&rsquo;re still processing your payment — your tenant
              will be ready in a few minutes. If this persists, reply to
              this email and we&rsquo;ll sort it manually.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={ctaStyle}
              data-testid="setting-up-retry"
            >
              Retry
            </button>
          </>
        )}
        {status === 'missing-session' && (
          <p style={bodyStyle} data-testid="setting-up-no-session">
            No checkout session in the URL. Start over at{' '}
            <a href="/get-started" style={linkStyle}>
              /get-started
            </a>
            .
          </p>
        )}
      </div>
    </div>
  );
}

function titleFor(status: ProvisionStatus): string {
  switch (status) {
    case 'pending':
      return 'Setting up your tenant';
    case 'ready':
      return 'Tenant ready';
    case 'failed':
      return 'Provisioning failed';
    case 'timeout':
      return 'Still processing';
    case 'missing-session':
      return 'No session';
  }
}

function labelFor(status: ProvisionStatus): string {
  switch (status) {
    case 'pending':
      return 'Provisioning';
    case 'ready':
      return 'Ready';
    case 'failed':
      return 'Failed';
    case 'timeout':
      return 'Hold';
    case 'missing-session':
      return 'Restart';
  }
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#0F0F10',
  color: '#F5F2EA',
  fontFamily: "var(--font-inter), 'Inter', system-ui, sans-serif",
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 560,
  background: '#1A1A1C',
  border: '1px solid #2A2A2C',
  borderRadius: 12,
  padding: 40,
};

const eyebrowStyle: React.CSSProperties = {
  fontFamily: "var(--font-jetbrains-mono), 'JetBrains Mono', monospace",
  fontSize: 11,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#D9A548',
  marginBottom: 14,
};

const headlineStyle: React.CSSProperties = {
  fontFamily: "var(--font-archivo-narrow), 'Archivo Narrow', sans-serif",
  fontSize: 32,
  fontWeight: 700,
  margin: '0 0 16px',
  letterSpacing: '-0.012em',
  color: '#F5F2EA',
};

const bodyStyle: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.55,
  color: '#F5F2EA',
  margin: '0 0 18px',
};

const mutedStyle: React.CSSProperties = {
  fontSize: 13,
  color: 'rgba(245,242,234,0.55)',
  fontFamily: "var(--font-jetbrains-mono), 'JetBrains Mono', monospace",
  margin: 0,
};

const ctaStyle: React.CSSProperties = {
  display: 'inline-block',
  marginTop: 12,
  padding: '12px 22px',
  background: '#D9A548',
  color: '#0F0F10',
  textDecoration: 'none',
  border: 'none',
  borderRadius: 6,
  fontFamily: "var(--font-jetbrains-mono), 'JetBrains Mono', monospace",
  fontWeight: 600,
  fontSize: 12,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  cursor: 'pointer',
};

const linkStyle: React.CSSProperties = {
  color: '#D9A548',
  textDecoration: 'underline',
};
