import type { Metadata } from 'next';
import {
  Archivo_Narrow,
  Barlow,
  Barlow_Condensed,
  Inter,
  Source_Serif_4,
  JetBrains_Mono,
} from 'next/font/google';
import './globals.css';

// Day 3 P2.2 — Google Fonts eliminated from runtime.
// next/font/google fetches fonts ONCE per build on the build server,
// then serves them self-hosted from the app's own origin. The
// visitor's browser never calls fonts.googleapis.com at runtime.
//
// Day 6 /field PWA redesign — B4 typography consolidation.
// Three families self-hosted for the worker PWA:
//   - Inter (sans) — body text, buttons, nav
//   - Source Serif 4 (serif) — headlines, receipt hero, primary numbers
//   - JetBrains Mono (mono) — receipt IDs, hashes, timestamps
// Existing Barlow/Barlow Condensed kept for the marketing / command
// surfaces which are outside the /field scope and untouched by this
// redesign.

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-barlow',
  display: 'swap',
});
const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800', '900'],
  variable: '--font-barlow-condensed',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-source-serif',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

// v1 display font — Archivo Narrow. Used by `brandTypography.familyDisplay`
// for screen headings + receipt-card primary metrics. Wired into the
// <html className> alongside the existing fonts so the CSS variable
// --font-archivo-narrow resolves at runtime.
const archivoNarrow = Archivo_Narrow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-archivo-narrow',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'FLOSTRUCTION — verified hours for construction labour hire',
  description: 'Every hour flows. Every pay right. A records system for construction labour hire. Workers confirm on-site. Supervisors confirm by SMS.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${barlow.variable} ${barlowCondensed.variable} ${inter.variable} ${sourceSerif.variable} ${jetbrainsMono.variable} ${archivoNarrow.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
