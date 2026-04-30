'use client';

// WlesInterestForm — F6 capture form for /wles/implementers and
// /wles/verifier. Email-only capture, posts to /api/wles/interest.
//
// Per WLES Foundation Constitution v1.0 cl 7.3 (open standard, no
// IP-based restriction on access or implementation), engagement is
// open. This form gives the Foundation Entity a contact path for
// prospective implementers and prospective independent verifiers.

import { useState } from 'react';

export type WlesInterestType = 'implementer' | 'verifier';

interface Props {
  interest: WlesInterestType;
}

type Status = 'idle' | 'submitting' | 'success' | 'error';

export default function WlesInterestForm({ interest }: Props) {
  const [email, setEmail] = useState('');
  const [organisation, setOrganisation] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    setErrorMessage('');
    try {
      const res = await fetch('/api/wles/interest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, interest, organisation, note }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus('error');
        setErrorMessage(data.error ?? 'Submission failed.');
        return;
      }
      setStatus('success');
    } catch {
      setStatus('error');
      setErrorMessage('Network error. Please try again.');
    }
  }

  if (status === 'success') {
    return (
      <div
        role="status"
        style={{
          padding: 16,
          border: '1px solid #2D5F3F',
          background: '#F5F2EA',
          color: '#2D5F3F',
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 14,
        }}
      >
        Thank you. The Foundation Entity will be in touch via{' '}
        <strong>{email}</strong>.
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        border: '1px solid #E2DDD0',
        background: '#FFF',
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 14,
      }}
    >
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span>Email *</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          style={{ padding: 8, border: '1px solid #C9C3B2', fontSize: 14 }}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span>Organisation</span>
        <input
          type="text"
          value={organisation}
          onChange={(e) => setOrganisation(e.target.value)}
          placeholder="(optional)"
          style={{ padding: 8, border: '1px solid #C9C3B2', fontSize: 14 }}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span>Note</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="(optional context)"
          style={{ padding: 8, border: '1px solid #C9C3B2', fontSize: 14 }}
        />
      </label>
      <button
        type="submit"
        disabled={status === 'submitting'}
        style={{
          padding: '10px 16px',
          background: '#2D5F3F',
          color: '#F5F2EA',
          border: 'none',
          fontSize: 14,
          cursor: status === 'submitting' ? 'wait' : 'pointer',
          alignSelf: 'flex-start',
        }}
      >
        {status === 'submitting' ? 'Submitting...' : 'Register interest'}
      </button>
      {status === 'error' && (
        <div role="alert" style={{ color: '#C74B3A', fontSize: 13 }}>
          {errorMessage}
        </div>
      )}
    </form>
  );
}
