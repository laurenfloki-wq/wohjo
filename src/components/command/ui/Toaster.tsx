'use client';

// FLOSTRUCTION /command — Toaster wrapper.
// Single mount point for sonner's <Toaster /> with our instrument
// styling. Mounted once in the command layout.

import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      richColors={false}
      closeButton={false}
      visibleToasts={4}
      gap={8}
      offset={20}
      // The instrument-grade styling. Sonner accepts a `toastOptions`
      // shape; the tokens come from src/styles/command-tokens.css.
      toastOptions={{
        unstyled: false,
        style: {
          background: 'var(--surface)',
          color: 'var(--ink)',
          border: '1px solid var(--rule-strong)',
          boxShadow:
            'inset 0 1px 0 0 var(--border-emboss), 0 2px 6px rgba(33, 32, 28, 0.08)',
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--t-sm)',
          padding: '12px 16px',
          borderRadius: 'var(--r-md)',
        },
        classNames: {
          description: 'flos-toast-description',
        },
      }}
    />
  );
}
