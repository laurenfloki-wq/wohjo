'use client';

import { useRef, useState, useCallback } from 'react';
import type { RefObject } from 'react';

interface ShareReceiptButtonProps {
  receiptRef: RefObject<HTMLDivElement | null>;
  receiptId: string;
}

export default function ShareReceiptButton({ receiptRef, receiptId }: ShareReceiptButtonProps) {
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState('');
  const downloadLinkRef = useRef<HTMLAnchorElement>(null);

  const captureReceipt = useCallback(async (): Promise<Blob | null> => {
    if (!receiptRef.current) return null;
    // Dynamic import to avoid SSR issues
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(receiptRef.current, {
      backgroundColor: '#ffffff',
      scale: 2, // Retina-quality
      useCORS: true,
      logging: false,
    });
    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png', 1.0);
    });
  }, [receiptRef]);

  async function handleShare() {
    setSharing(true);
    setMessage('');

    try {
      const blob = await captureReceipt();
      if (!blob) {
        setMessage('Could not capture receipt');
        setSharing(false);
        return;
      }

      const file = new File([blob], `FSTR-Receipt-${receiptId}.png`, { type: 'image/png' });

      // Try Web Share API first (mobile)
      if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `Flostruction receipt ${receiptId}`,
          text: `Timesheet receipt ${receiptId} — Flostruction verified`,
          files: [file],
        });
        setMessage('Shared');
      } else {
        // Download fallback
        const url = URL.createObjectURL(blob);
        if (downloadLinkRef.current) {
          downloadLinkRef.current.href = url;
          downloadLinkRef.current.download = `FSTR-Receipt-${receiptId}.png`;
          downloadLinkRef.current.click();
          URL.revokeObjectURL(url);
          setMessage('Downloaded');
        }
      }
    } catch (err: unknown) {
      // User cancelled share — not an error
      if (err instanceof Error && err.name === 'AbortError') {
        // Silently ignore
      } else {
        setMessage('Share failed — try again');
      }
    } finally {
      setSharing(false);
      // Clear message after 3 seconds
      setTimeout(() => setMessage(''), 3000);
    }
  }

  return (
    <>
      <a ref={downloadLinkRef} style={{ display: 'none' }} />
      <button
        onClick={handleShare}
        disabled={sharing}
        style={{
          width: '100%',
          padding: '14px 16px',
          background: '#FFFFFF',
          color: '#0E1C2F',
          border: '1px solid #0E1C2F',
          borderRadius: 'var(--radius-btn)',
          fontFamily: "'Inter', system-ui, sans-serif",
          fontWeight: 700,
          fontSize: '15px',
          cursor: sharing ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}
      >
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
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
        {sharing ? 'Capturing…' : 'Share Receipt'}
      </button>
      {message && (
        <div style={{
          textAlign: 'center',
          fontSize: '12px',
          color: message === 'Share failed — try again' ? '#DC2626' : 'var(--color-green-text)',
          marginTop: '6px',
          fontWeight: 600,
        }}>
          {message}
        </div>
      )}
    </>
  );
}
