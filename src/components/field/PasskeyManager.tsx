'use client';

// Phase A (WORKER_PASSKEY_ACCESS) — worker passkey enrol + sign-in.
//
// A passkey is a convenience layer that sits ON TOP OF the SMS/phone-OTP
// floor; it never replaces it. So the SMS affordance ("Use a one-time SMS
// code instead") is rendered on EVERY state of this component — idle,
// working, error, and success — and any failure routes the worker straight
// back to the SMS floor at /field. Enrolment is gated server-side on a fresh
// SMS code-verify (SMS_VERIFY_REQUIRED → we send them to /field to verify).

import { useCallback, useEffect, useState } from 'react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

type Status =
  | { kind: 'idle' }
  | { kind: 'working'; what: 'enrol' | 'signin' }
  | { kind: 'error'; message: string }
  | { kind: 'enrolled' }
  | { kind: 'signed-in' };

interface DeviceSummary {
  id: string;
  deviceLabel: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

const INK = '#0E1C2F';
const CREAM = '#F5F2EA';
const LINE = '#D9D5CB';

type JsonObject = Record<string, unknown>;

async function sendJson(
  url: string,
  method: 'POST' | 'DELETE',
  body?: unknown,
): Promise<{ res: Response; data: JsonObject }> {
  const init: RequestInit = { method, headers: { 'content-type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as JsonObject;
  return { res, data };
}

const postJson = (url: string, body?: unknown) => sendJson(url, 'POST', body);

function formatWhen(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * `firstRun` shows a one-time post-SMS-sign-in enrolment offer with a "Skip for
 * now" affordance (enrolment is never mandatory). Without it, this is the
 * re-offerable "your devices" management view.
 */
export default function PasskeyManager({ firstRun = false }: { firstRun?: boolean }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [devices, setDevices] = useState<DeviceSummary[] | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const refreshDevices = useCallback(async () => {
    try {
      const res = await fetch('/api/worker/passkey/credentials');
      if (!res.ok) {
        setDevices([]); // 404 (flag off) or auth — treat as none; SMS stays the floor
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { credentials?: DeviceSummary[] };
      setDevices(data.credentials ?? []);
    } catch {
      setDevices([]);
    }
  }, []);

  useEffect(() => {
    // Load the enrolled-devices list once on mount. setState happens inside the
    // async callback (not synchronously in the effect body), so this is the
    // legitimate data-fetch-on-mount case, not a cascading-render trap.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshDevices();
  }, [refreshDevices]);

  async function handleRevoke(id: string) {
    setRevoking(id);
    try {
      const { res } = await sendJson('/api/worker/passkey/credentials', 'DELETE', { id });
      if (res.ok) await refreshDevices();
    } catch {
      // Non-fatal — the device list simply won't change; SMS stays available.
    } finally {
      setRevoking(null);
    }
  }

  async function handleEnrol() {
    setStatus({ kind: 'working', what: 'enrol' });
    try {
      const opt = await postJson('/api/worker/passkey/register-options');
      if (opt.res.status === 403 && opt.data?.error === 'SMS_VERIFY_REQUIRED') {
        // The SMS floor: a fresh code-verify is required before enrolling.
        window.location.href = '/field?next=passkey&reason=verify';
        return;
      }
      if (!opt.res.ok || !opt.data?.options) {
        setStatus({
          kind: 'error',
          message: 'Could not start enrolment. Use an SMS code instead.',
        });
        return;
      }
      const attestation = await startRegistration({
        optionsJSON: opt.data.options as Parameters<typeof startRegistration>[0]['optionsJSON'],
      });
      const label =
        typeof navigator !== 'undefined' ? navigator.platform || 'This device' : 'This device';
      const verify = await postJson('/api/worker/passkey/register-verify', {
        response: attestation,
        deviceLabel: label,
      });
      if (!verify.res.ok || !verify.data?.ok) {
        setStatus({
          kind: 'error',
          message: 'Enrolment did not complete. Use an SMS code instead.',
        });
        return;
      }
      setStatus({ kind: 'enrolled' });
      await refreshDevices();
    } catch {
      // User cancelled the platform prompt, or no authenticator — fall to SMS.
      setStatus({
        kind: 'error',
        message: 'Enrolment was cancelled. You can always use an SMS code instead.',
      });
    }
  }

  async function handleSignIn() {
    setStatus({ kind: 'working', what: 'signin' });
    try {
      const opt = await postJson('/api/worker/passkey/auth-options');
      if (!opt.res.ok || !opt.data?.options) {
        setStatus({
          kind: 'error',
          message: 'Could not start passkey sign-in. Use an SMS code instead.',
        });
        return;
      }
      const assertion = await startAuthentication({
        optionsJSON: opt.data.options as Parameters<typeof startAuthentication>[0]['optionsJSON'],
      });
      const verify = await postJson('/api/worker/passkey/auth-verify', { response: assertion });
      if (!verify.res.ok || !verify.data?.ok) {
        setStatus({
          kind: 'error',
          message: 'Passkey sign-in did not complete. Use an SMS code instead.',
        });
        return;
      }
      setStatus({ kind: 'signed-in' });
    } catch {
      setStatus({
        kind: 'error',
        message: 'Passkey sign-in was cancelled. You can always use an SMS code instead.',
      });
    }
  }

  const working = status.kind === 'working';

  return (
    <div style={styles.card}>
      <h2 style={styles.heading}>Sign in faster with a passkey</h2>
      <p style={styles.body}>
        After you have verified once with an SMS code, you can enrol this device so future sign-ins
        use your fingerprint, face, or screen lock. Your phone number and SMS codes always keep
        working — a passkey never replaces them.
      </p>

      {status.kind === 'enrolled' && (
        <p style={styles.success} role="status">
          This device is enrolled. Next time, choose “Sign in with passkey”.
        </p>
      )}
      {status.kind === 'signed-in' && (
        <p style={styles.success} role="status">
          Signed in with your passkey.
        </p>
      )}
      {status.kind === 'error' && (
        <p style={styles.error} role="alert">
          {status.message}
        </p>
      )}

      <button type="button" style={styles.primary} onClick={handleEnrol} disabled={working}>
        {status.kind === 'working' && status.what === 'enrol' ? 'Enrolling…' : 'Enrol this device'}
      </button>
      <button type="button" style={styles.secondary} onClick={handleSignIn} disabled={working}>
        {status.kind === 'working' && status.what === 'signin'
          ? 'Signing in…'
          : 'Sign in with passkey'}
      </button>

      {/* First-run: enrolment is never mandatory — always offer a skip. */}
      {firstRun && (
        <a href="/field/home" style={styles.skipLink}>
          Skip for now
        </a>
      )}

      {/* Your devices — list + revoke. Hidden until loaded; empty when none. */}
      {devices && devices.length > 0 && (
        <div style={styles.devices}>
          <div style={styles.devicesHeading}>Your enrolled devices</div>
          {devices.map((d) => (
            <div key={d.id} style={styles.deviceRow}>
              <div>
                <div style={styles.deviceLabel}>{d.deviceLabel ?? 'Enrolled device'}</div>
                <div style={styles.deviceMeta}>
                  Added {formatWhen(d.createdAt)} · last used {formatWhen(d.lastUsedAt)}
                </div>
              </div>
              <button
                type="button"
                style={styles.revoke}
                onClick={() => handleRevoke(d.id)}
                disabled={revoking === d.id}
              >
                {revoking === d.id ? 'Removing…' : 'Remove'}
              </button>
            </div>
          ))}
          <p style={styles.fallbackNote}>
            Removing your last device just sends you back to one-time SMS codes — you are never
            locked out.
          </p>
        </div>
      )}

      {/* SMS affordance — present on every screen/state, never hidden. */}
      <div style={styles.fallback}>
        <a href="/field" style={styles.fallbackLink}>
          Use a one-time SMS code instead
        </a>
        <p style={styles.fallbackNote}>
          SMS is always available — for first sign-in, a new device, or if a passkey ever does not
          work.
        </p>
      </div>
    </div>
  );
}

const styles = {
  card: {
    maxWidth: 480,
    margin: '0 auto',
    background: '#FFFFFF',
    border: `1px solid ${LINE}`,
    borderRadius: 12,
    padding: '24px 22px',
    fontFamily: 'var(--font-inter, "IBM Plex Sans", system-ui, sans-serif)',
    color: INK,
  } as React.CSSProperties,
  heading: {
    fontFamily: 'var(--font-source-serif, "IBM Plex Serif", Georgia, serif)',
    fontSize: 20,
    fontWeight: 700,
    margin: '0 0 10px',
  } as React.CSSProperties,
  body: { fontSize: 15, lineHeight: 1.6, margin: '0 0 18px' } as React.CSSProperties,
  primary: {
    display: 'block',
    width: '100%',
    background: INK,
    color: CREAM,
    border: 'none',
    borderRadius: 8,
    padding: '13px 16px',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    marginBottom: 10,
  } as React.CSSProperties,
  secondary: {
    display: 'block',
    width: '100%',
    background: 'transparent',
    color: INK,
    border: `1px solid ${INK}`,
    borderRadius: 8,
    padding: '12px 16px',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
  } as React.CSSProperties,
  skipLink: {
    display: 'block',
    textAlign: 'center',
    color: '#5B6675',
    textDecoration: 'underline',
    fontSize: 14,
    fontWeight: 600,
    marginTop: 14,
  } as React.CSSProperties,
  devices: {
    marginTop: 22,
    paddingTop: 16,
    borderTop: `1px solid ${LINE}`,
  } as React.CSSProperties,
  devicesHeading: {
    fontSize: 13,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#5B6675',
    marginBottom: 10,
  } as React.CSSProperties,
  deviceRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '10px 0',
    borderBottom: `1px solid ${LINE}`,
  } as React.CSSProperties,
  deviceLabel: { fontSize: 15, fontWeight: 600, color: INK } as React.CSSProperties,
  deviceMeta: { fontSize: 12, color: '#5B6675', marginTop: 2 } as React.CSSProperties,
  revoke: {
    background: 'transparent',
    color: '#7A271A',
    border: '1px solid #E6BCB4',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  fallback: {
    marginTop: 22,
    paddingTop: 16,
    borderTop: `1px solid ${LINE}`,
  } as React.CSSProperties,
  fallbackLink: {
    color: INK,
    textDecoration: 'underline',
    fontSize: 15,
    fontWeight: 600,
  } as React.CSSProperties,
  fallbackNote: {
    fontSize: 13,
    color: '#5B6675',
    margin: '8px 0 0',
    lineHeight: 1.5,
  } as React.CSSProperties,
  success: {
    fontSize: 14,
    color: '#1B5E20',
    background: '#EAF4EC',
    border: '1px solid #BFD9C4',
    borderRadius: 8,
    padding: '10px 12px',
    margin: '0 0 16px',
  } as React.CSSProperties,
  error: {
    fontSize: 14,
    color: '#7A271A',
    background: '#FBEAE7',
    border: '1px solid #E6BCB4',
    borderRadius: 8,
    padding: '10px 12px',
    margin: '0 0 16px',
  } as React.CSSProperties,
} as const;
