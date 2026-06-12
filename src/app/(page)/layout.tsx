import type { ReactNode } from 'react';
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Serif } from 'next/font/google';
import PageRail from '@/components/page/PageRail';
import './operator.css';

// Warm-light operator surface (directors' decision 12 June 2026).
// IBM Plex Serif is the system's voice; Sans is UI chrome; Mono is
// record data. Self-hosted via next/font — no runtime Google calls.
const plexSerif = IBM_Plex_Serif({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-plex-serif',
  display: 'swap',
});
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export default function OperatorLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`pageop ${plexSerif.variable} ${plexSans.variable} ${plexMono.variable}`}
      id="pageop-root"
    >
      <a href="#main" className="skip">
        Skip to the page
      </a>
      <div className="shell">
        <PageRail />
        <div className="wrap" id="main">
          {children}
        </div>
      </div>
    </div>
  );
}
