// Designed offline state for Flostruction Field (audit 2026-07-02).
// Served by public/field-sw.js when a /field navigation fails offline.
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'No connection — Flostruction Field',
  robots: { index: false, follow: false },
};

export default function FieldOfflinePage() {
  return (
    <div
      style={{
        minHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '24px',
        background: '#F5F2EA',
        color: '#0F0F10',
      }}
    >
      <h1 style={{ fontFamily: 'var(--font-archivo-narrow)', fontSize: '30px', fontWeight: 700, marginBottom: '12px' }}>
        No connection
      </h1>
      <p style={{ fontSize: '15px', lineHeight: 1.6, maxWidth: '340px', color: 'rgba(15,15,16,0.75)', marginBottom: '28px' }}>
        Flostruction Field needs a connection to record and seal hours.
        Nothing is lost — when your signal returns, pick up where you left off.
      </p>
      <a
        href="/field"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '48px',
          padding: '0 28px',
          background: '#0F0F10',
          color: '#FFFFFF',
          fontWeight: 700,
          fontSize: '15px',
          borderRadius: '8px',
          textDecoration: 'none',
        }}
      >
        Try again
      </a>
    </div>
  );
}
