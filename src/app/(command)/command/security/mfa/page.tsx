'use client';

// W6(b) -- minimal admin TOTP MFA page: enrol (secret + otpauth link,
// manual-entry friendly), confirm with a first code, and verify when a
// grant has lapsed. Authenticator apps accept manual key entry, so no
// QR dependency is introduced.

import { useCallback, useEffect, useState } from 'react';

interface MfaStatus {
  enrolled: boolean;
  pending: boolean;
  grantActive: boolean;
  grantExpiresAt: string | null;
}

export default function AdminMfaPage() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauth, setOtpauth] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    const res = await fetch('/api/command/mfa/status');
    if (res.ok) setStatus((await res.json()) as MfaStatus);
    else setMessage('Could not load MFA status.');
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  async function post(path: string, body?: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setMessage(typeof data.error === 'string' ? data.error : 'Request failed.');
        return null;
      }
      return data;
    } finally {
      setBusy(false);
    }
  }

  async function handleEnroll() {
    const data = await post('/api/command/mfa/enroll');
    if (data) {
      setSecret(data.secretBase32 as string);
      setOtpauth(data.otpauthUri as string);
      setMessage('Add the key to your authenticator app, then enter the 6-digit code below.');
      await loadStatus();
    }
  }

  async function handleCode(path: '/api/command/mfa/confirm' | '/api/command/mfa/verify') {
    const data = await post(path, { code });
    if (data) {
      setCode('');
      setSecret(null);
      setOtpauth(null);
      setMessage('Verified. This device is good for 12 hours.');
      await loadStatus();
    }
  }

  return (
    <div className="mx-auto max-w-xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Two-factor authentication</h1>

      {status === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm">
            Status:{' '}
            {status.enrolled
              ? status.grantActive
                ? 'Enrolled — verified on this session'
                : 'Enrolled — verification required'
              : status.pending
                ? 'Enrolment started — confirm with a code'
                : 'Not enrolled'}
          </p>

          {!status.enrolled && (
            <button
              type="button"
              onClick={() => void handleEnroll()}
              disabled={busy}
              className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {status.pending ? 'Restart enrolment (new key)' : 'Start enrolment'}
            </button>
          )}

          {secret && (
            <div className="rounded border p-4 text-sm space-y-2">
              <p className="font-medium">Authenticator key (enter manually):</p>
              <code className="block break-all rounded bg-gray-100 p-2">{secret}</code>
              {otpauth && (
                <a className="text-blue-600 underline" href={otpauth}>
                  Open in authenticator app
                </a>
              )}
            </div>
          )}

          {(secret || status.pending || (status.enrolled && !status.grantActive)) && (
            <div className="flex items-center gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                maxLength={6}
                placeholder="6-digit code"
                className="w-32 rounded border px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() =>
                  void handleCode(status.enrolled ? '/api/command/mfa/verify' : '/api/command/mfa/confirm')
                }
                disabled={busy || code.length !== 6}
                className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {status.enrolled ? 'Verify' : 'Confirm enrolment'}
              </button>
            </div>
          )}

          {status.enrolled && status.grantActive && status.grantExpiresAt && (
            <p className="text-xs text-gray-500">
              Verified until {new Date(status.grantExpiresAt).toLocaleString()}.
            </p>
          )}
        </div>
      )}

      {message && <p className="text-sm text-amber-700">{message}</p>}
    </div>
  );
}
