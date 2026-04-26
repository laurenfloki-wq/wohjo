'use client';

/**
 * Add-to-Home-Screen prompt for Flostruction Field PWA.
 *   - Platform detection: iOS Safari, Android Chrome, Desktop Chrome/Edge.
 *   - Two-line copy per platform (label + how-to).
 *   - Dismissible; 30-day localStorage memory.
 *   - Uses native BeforeInstallPromptEvent when browser fires it
 *     (Android Chrome, Desktop Chrome/Edge); falls back to manual
 *     instructions on iOS and anywhere the event does not fire.
 *   - A9: no emoji in worker-facing copy.
 */

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Platform = 'ios' | 'android' | 'desktop' | 'unsupported';

const APP_LABEL = 'Flostruction Field';
const DISMISS_KEY = 'wohjo_a2hs_dismissed';
const DISMISS_DAYS = 30;
const ANDROID_FALLBACK_DELAY_MS = 3000;
const IOS_SHOW_DELAY_MS = 2000;
const DESKTOP_FALLBACK_DELAY_MS = 3000;

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'unsupported';
  const ua = navigator.userAgent.toLowerCase();
  // iOS Safari (we can't install on iOS Chrome/Firefox, but manual A2HS still works in Safari)
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  // Desktop: must be Chromium-family (Chrome, Edge) for install to be meaningful
  const isChromium = /chrome|edg\//.test(ua) && !/mobile/.test(ua);
  if (isChromium) return 'desktop';
  return 'unsupported';
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator &&
      (window.navigator as unknown as { standalone: boolean }).standalone === true)
  );
}

function wasDismissedRecently(): boolean {
  if (typeof localStorage === 'undefined') return false;
  const ts = localStorage.getItem(DISMISS_KEY);
  if (!ts) return false;
  const dismissedAt = parseInt(ts, 10);
  if (!Number.isFinite(dismissedAt)) return false;
  const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
  return daysSince < DISMISS_DAYS;
}

function setDismissed(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  }
}

export default function AddToHomeScreenPrompt() {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<Platform>('unsupported');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Already installed — don't show.
    if (isStandalone()) return;
    // Recently dismissed — don't show.
    if (wasDismissedRecently()) return;

    const p = detectPlatform();
    setPlatform(p);
    if (p === 'unsupported') return;

    // Native install event (fires on Android Chrome + Desktop Chrome/Edge).
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Platform-specific fallbacks when the native event does not fire.
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (p === 'ios') {
      timer = setTimeout(() => setVisible(true), IOS_SHOW_DELAY_MS);
    } else if (p === 'android') {
      timer = setTimeout(() => setVisible((v) => v || true), ANDROID_FALLBACK_DELAY_MS);
    } else if (p === 'desktop') {
      timer = setTimeout(() => setVisible((v) => v || true), DESKTOP_FALLBACK_DELAY_MS);
    }

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') setVisible(false);
    } finally {
      setDeferredPrompt(null);
      setInstalling(false);
    }
  }

  function handleDismiss() {
    setDismissed();
    setVisible(false);
  }

  if (!visible) return null;

  // ---- Two-line copy per platform -----------------------------------------
  // Line 1: what/why. Line 2: how.
  let line1 = `Install ${APP_LABEL}`;
  let line2 = '';
  let primary: { label: string; onClick: () => void } | null = null;

  if (platform === 'ios') {
    line1 = `Install ${APP_LABEL} on your iPhone`;
    line2 = 'Tap the Share icon, then "Add to Home Screen".';
  } else if (platform === 'android' && deferredPrompt) {
    line1 = `Install ${APP_LABEL} on your phone`;
    line2 = 'One tap — no app store needed.';
    primary = { label: installing ? 'Installing…' : 'Install', onClick: handleInstall };
  } else if (platform === 'android' && !deferredPrompt) {
    line1 = `Install ${APP_LABEL} on your phone`;
    line2 = 'Open the browser menu ⋮, then "Add to Home screen".';
  } else if (platform === 'desktop' && deferredPrompt) {
    line1 = `Install ${APP_LABEL} on your computer`;
    line2 = 'Runs in its own window — no tab needed.';
    primary = { label: installing ? 'Installing…' : 'Install', onClick: handleInstall };
  } else if (platform === 'desktop' && !deferredPrompt) {
    line1 = `Install ${APP_LABEL} on your computer`;
    line2 = 'Click the install icon in the address bar.';
  }

  return (
    <div
      role="dialog"
      aria-label={`${APP_LABEL} install prompt`}
      data-testid="a2hs-prompt"
      style={{
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-card)',
        padding: '14px 16px',
        marginBottom: '16px',
        position: 'relative',
      }}
    >
      <button
        onClick={handleDismiss}
        aria-label="Dismiss install prompt for 30 days"
        data-testid="a2hs-dismiss"
        style={{
          position: 'absolute',
          top: '6px',
          right: '6px',
          background: 'none',
          border: 'none',
          color: 'var(--color-text-tertiary)',
          fontSize: '20px',
          lineHeight: 1,
          padding: '4px 8px',
          cursor: 'pointer',
        }}
      >
        ×
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          aria-hidden
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'var(--color-navy)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              color: '#fff',
              fontWeight: 800,
              fontSize: '16px',
              fontFamily: "'Source Serif 4', 'Source Serif Pro', Georgia, serif",
              fontStyle: 'italic',
            }}
          >
            F
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: '14px',
              color: 'var(--color-text-primary)',
              lineHeight: 1.3,
            }}
          >
            {line1}
          </div>
          <div
            style={{
              fontSize: '13px',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.35,
              marginTop: '2px',
            }}
          >
            {line2}
          </div>
        </div>

        {primary && (
          <button
            onClick={primary.onClick}
            disabled={installing}
            data-testid="a2hs-install"
            style={{
              background: 'var(--color-green)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-btn)',
              padding: '8px 14px',
              fontWeight: 700,
              fontSize: '13px',
              cursor: installing ? 'not-allowed' : 'pointer',
              flexShrink: 0,
            }}
          >
            {primary.label}
          </button>
        )}
      </div>
    </div>
  );
}
