'use client';

// Phase A (WORKER_PASSKEY_ACCESS) — app-open passkey-first sign-in.
//
// Rendered at the top of the /field login screen. If app-open passkey login is
// live (the options endpoint returns 200), it shows a "Sign in with Face /
// fingerprint" button; otherwise it renders nothing and the worker sees only
// the SMS form below. On success the worker lands in /field/home with a minted
// worker-session. On ANY failure / cancel / no-passkey it stays on the screen
// and the SMS form below is always available — never a dead-end.
//
// Options are pre-fetched on mount so the WebAuthn call fires synchronously
// inside the tap gesture (browsers require a user activation for it).

import { useEffect, useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';

type OptionsJSON = Parameters<typeof startAuthentication>[0]['optionsJSON'];

export default function PasskeyFirstSignIn() {
  const [options, setOptions] = useState<OptionsJSON | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Probe enablement + prewarm the discoverable challenge.
    (async () => {
      try {
        const res = await fetch('/api/worker/passkey/auth-options-open', { method: 'POST' });
        if (!res.ok) return; // 404 = feature off → render nothing, SMS only
        const data = (await res.json().catch(() => ({}))) as { options?: OptionsJSON };
        if (!cancelled && data.options) setOptions(data.options);
      } catch {
        // Network error — stay silent; the SMS form below still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!options) return null; // feature off or not yet loaded — SMS form carries the screen

  async function handlePasskey() {
    if (!options) return;
    setBusy(true);
    setError(null);
    try {
      // Fire WebAuthn synchronously within the gesture (no awaits before it).
      const assertion = await startAuthentication({ optionsJSON: options });
      const verify = await fetch('/api/worker/passkey/auth-verify-open', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ response: assertion }),
      });
      const data = (await verify.json().catch(() => ({}))) as { ok?: boolean };
      if (verify.ok && data.ok) {
        window.location.href = '/field/home';
        return;
      }
      setError('That didn’t work. Use a one-time SMS code below.');
    } catch {
      // Cancelled the prompt, no passkey on this device, or unavailable.
      setError('No passkey used. You can sign in with an SMS code below.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <button type="button" onClick={handlePasskey} disabled={busy} style={styles.button}>
        {busy ? 'Checking…' : 'Sign in with Face / fingerprint'}
      </button>
      {error && (
        <p role="alert" style={styles.error}>
          {error}
        </p>
      )}
      <div style={styles.divider}>
        <span style={styles.dividerText}>or use a one-time SMS code</span>
      </div>
    </div>
  );
}

const styles = {
  button: {
    display: 'block',
    width: '100%',
    background: 'var(--color-text-primary, #0E1C2F)',
    color: 'var(--color-bg, #F5F0E8)',
    border: 'none',
    borderRadius: 'var(--radius-large, 10px)',
    padding: '14px 16px',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
  } as React.CSSProperties,
  error: {
    fontSize: 13,
    color: '#7A271A',
    margin: '10px 0 0',
    lineHeight: 1.5,
  } as React.CSSProperties,
  divider: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '18px 0 2px',
  } as React.CSSProperties,
  dividerText: {
    fontSize: 12,
    color: 'var(--color-text-tertiary, #5B6675)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  } as React.CSSProperties,
} as const;
