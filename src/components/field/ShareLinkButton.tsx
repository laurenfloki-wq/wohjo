'use client';

// Flostruction Field — Share-Link Button
//
// Tap to share the receipt's public verification URL. Uses Web Share
// API where available (mobile / Safari / Edge); falls back to
// clipboard copy with toast confirmation. The URL points to the
// public route (/receipt/<id>) — the surface intended for outward
// sharing (employer, accountant, Fair Work, tribunal). The
// authenticated worker app continues to deep-link to /field/receipt
// from SMS and from the records list; the public URL is what the
// worker hands to anyone outside.
//
// Built 2026-04-30 evening per labour-hire-workflow-gap-analysis-
// 2026-04-29 §G12 (worker-controlled share affordance). Sibling to
// ShareReceiptButton (which captures a PNG of the receipt) — they
// serve different share modalities and are both shown.

import { useCallback, useState, type FC } from 'react';

interface ShareLinkButtonProps {
  receiptId: string;
}

const ShareLinkButton: FC<ShareLinkButtonProps> = ({ receiptId }) => {
  const [status, setStatus] = useState<'idle' | 'sharing' | 'shared' | 'copied' | 'failed'>('idle');

  const publicUrl = `https://flosmosis.com/receipt/${receiptId}`;

  const handleShare = useCallback(async () => {
    setStatus('sharing');

    const shareData = {
      title: `FLOSTRUCTION receipt ${receiptId}`,
      text: `Verified shift record — ${receiptId}`,
      url: publicUrl,
    };

    // Prefer Web Share API where available.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData);
        setStatus('shared');
        setTimeout(() => setStatus('idle'), 2500);
        return;
      } catch (err) {
        // AbortError = user cancelled the share sheet. Treat as no-op,
        // not failure.
        if (err instanceof Error && err.name === 'AbortError') {
          setStatus('idle');
          return;
        }
        // Any other error — fall through to clipboard fallback.
      }
    }

    // Clipboard fallback. Most modern browsers; if denied / unavailable
    // we surface "failed" so the worker can copy the URL manually from
    // the visible link below.
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(publicUrl);
        setStatus('copied');
        setTimeout(() => setStatus('idle'), 2500);
        return;
      }
      throw new Error('clipboard unavailable');
    } catch {
      setStatus('failed');
      setTimeout(() => setStatus('idle'), 4000);
    }
  }, [publicUrl, receiptId]);

  const label =
    status === 'sharing' ? 'Sharing…' :
    status === 'shared' ? 'Shared' :
    status === 'copied' ? 'Link copied' :
    status === 'failed' ? 'Could not copy — long-press the link below' :
    'Share verification link';

  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={handleShare}
        disabled={status === 'sharing'}
        style={{
          width: '100%',
          padding: '14px 16px',
          background: 'transparent',
          color: '#0E1C2F',
          border: '1px solid #0E1C2F',
          borderRadius: 'var(--radius-btn, 8px)',
          fontFamily: "'Inter', system-ui, sans-serif",
          fontWeight: 700,
          fontSize: 15,
          cursor: status === 'sharing' ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <LinkIcon />
        {label}
      </button>
      {/* Status row also serves as the manual-copy fallback when the
          clipboard API is denied. */}
      {status === 'failed' && (
        <div
          style={{
            marginTop: 8,
            padding: '8px 12px',
            background: '#F5F2EA',
            border: '1px solid #E2DDD0',
            borderRadius: 8,
            fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
            fontSize: 12,
            wordBreak: 'break-all',
            color: '#0E1C2F',
            userSelect: 'all',
          }}
        >
          {publicUrl}
        </div>
      )}
    </div>
  );
};

const LinkIcon: FC = () => (
  <svg
    width={16}
    height={16}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

export default ShareLinkButton;
