'use client';

/**
 * OnboardingBanner — Client Component
 * Shown once to new workers. Dismissed via localStorage.
 * Spec: Section 3.2
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const STORAGE_KEY = 'worker-onboarding-banner-shown-v1';

// MINOR-1 (CRACK 222) — only show the onboarding banner AFTER the worker
// has seen their first sealed receipt. Pre-fix the banner appeared on
// /field/home for users who hadn't yet clocked in/out — the content
// ("Read what your sealed records mean") asked them to think about a
// thing they hadn't yet experienced. Set by the receipt page on first
// successful render of a sealed shift.
const FIRST_SEAL_FLAG = 'worker-first-shift-sealed-v1';

const BANNER_STYLE: React.CSSProperties = {
  background: '#0E1C2F',
  color: '#F5F2EA',
  padding: '16px 20px',
  fontFamily: 'var(--font-inter, "IBM Plex Sans", system-ui, sans-serif)',
  fontSize: '15px',
  lineHeight: 1.5,
};

const BUTTON_ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  gap: '10px',
  marginTop: '14px',
  flexWrap: 'wrap',
};

const READ_NOW_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '48px',
  padding: '0 20px',
  background: '#F5F2EA',
  color: '#0E1C2F',
  fontWeight: 700,
  fontSize: '14px',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  textDecoration: 'none',
};

const SKIP_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '48px',
  padding: '0 20px',
  background: 'transparent',
  color: 'rgba(245,242,234,0.75)',
  fontWeight: 500,
  fontSize: '14px',
  border: '1px solid rgba(245,242,234,0.3)',
  borderRadius: '8px',
  cursor: 'pointer',
};

export default function OnboardingBanner() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show only if (a) the worker has seen their first sealed receipt AND
    // (b) they haven't already dismissed the banner. CRACK 222 / MINOR-1.
    if (typeof window !== 'undefined') {
      const firstSeal = localStorage.getItem(FIRST_SEAL_FLAG);
      if (firstSeal !== 'true') return;
      const shown = localStorage.getItem(STORAGE_KEY);
      if (shown !== 'true') {
        setVisible(true);
      }
    }
  }, []);

  function handleReadNow() {
    router.push('/field/seal');
  }

  function handleSkip() {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, 'true');
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div role="banner" style={BANNER_STYLE}>
      <p style={{ margin: 0 }}>
        New to FLOSTRUCTION? Read what your sealed records mean and your rights as a worker.
      </p>
      <div style={BUTTON_ROW_STYLE}>
        <button type="button" onClick={handleReadNow} style={READ_NOW_STYLE}>
          Read now
        </button>
        <button type="button" onClick={handleSkip} style={SKIP_STYLE}>
          Skip for now
        </button>
      </div>
    </div>
  );
}
