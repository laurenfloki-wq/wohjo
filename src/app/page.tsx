import type { Metadata, Viewport } from 'next';
import MarketingPage from '@/components/marketing/MarketingPage';

// Flostruction marketing landing v5 — root route (/)
// Design source of truth: flostruction-v5.html (approved 2026-06-10).
// No navigation to /field, /verify, /command — public-facing only.
//
// Craft pass 2026-06-10: full identity + sharing metadata. Title casing
// follows the prototype (flostruction-v5.html:6 — lowercase "verified
// hours"); description mirrors the footer disclaimer's restraint (time
// verification, not payroll) and stays under 160 characters.
const TITLE = 'FLOSTRUCTION — verified hours for construction labour hire';
const DESCRIPTION =
  'Time verification for Australian construction and labour hire. Every hour verified at the point of work, sealed into a permanent, tamper-evident record.';

export const metadata: Metadata = {
  metadataBase: new URL('https://flosmosis.com'),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: 'https://flosmosis.com',
    siteName: 'FLOSTRUCTION',
    type: 'website',
    locale: 'en_AU',
    images: [
      {
        url: '/marketing/og.png',
        width: 1200,
        height: 630,
        alt: 'FLOSTRUCTION — Every hour verified. Every record permanent.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/marketing/og.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#0b0907',
};

export default function Home() {
  return <MarketingPage />;
}
