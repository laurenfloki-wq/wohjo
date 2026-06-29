import type { Metadata } from 'next';
import { headers } from 'next/headers';
import {
  Archivo_Narrow,
  Barlow,
  Barlow_Condensed,
  Fraunces,
  Inter,
  Source_Serif_4,
  JetBrains_Mono,
} from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import { SITE_URL } from '@/lib/seo/site';
import {
  JsonLd,
  organizationSchema,
  softwareApplicationSchema,
  personNode,
} from '@/lib/seo/jsonld';

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

// Marketing/editorial display faces. These are used only by the editorial
// content shell (src/components/content/content.css — guides, licence pages,
// etc.) and the legacy marketing surfaces, NOT by the command-light surfaces
// (/command, /field, /labour-hire-exposure-check), which load only Inter,
// Fraunces and JetBrains Mono. preload:false drops their preload <link> from
// every route so a command-light page never fetches a face it can't render;
// on the routes that DO use them they still load on first paint (display:swap).
const barlow = Barlow({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-barlow',
  display: 'swap',
  preload: false,
});
const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800', '900'],
  variable: '--font-barlow-condensed',
  display: 'swap',
  preload: false,
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
  preload: false,
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
  preload: false,
});

// CADA — Fraunces as the /command display face. A refined contemporary
// serif with optical sizing across the regular weights. Used by
// `--font-display` for page titles and signature surfaces (Trust banner,
// Evidence pack). Body copy continues to use Inter.
const fraunces = Fraunces({
  subsets: ['latin'],
  // Variable font — let Next.js pull every weight + the SOFT/opsz axes
  // so we can drive optical sizing and softness from CSS variations.
  axes: ['opsz', 'SOFT'],
  variable: '--font-fraunces',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'FLOSTRUCTION — verified hours for construction labour hire',
  description:
    'Every hour flows. Every pay right. A records system for construction labour hire. Workers confirm on-site. Supervisors confirm by SMS.',
  // Search engine ownership verification. Tokens are supplied via env so no
  // value ships when unset (no empty/broken meta tag). Set in Vercel:
  //   NEXT_PUBLIC_GSC_VERIFICATION  — Google Search Console
  //   NEXT_PUBLIC_BING_VERIFICATION — Bing Webmaster (feeds ChatGPT's index)
  verification: {
    google: process.env.NEXT_PUBLIC_GSC_VERIFICATION,
    other: process.env.NEXT_PUBLIC_BING_VERIFICATION
      ? { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_VERIFICATION }
      : {},
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // CRACK 211 — read the per-request CSP nonce produced by src/middleware.ts.
  // Pass it down to any inline <Script> via the `nonce` prop. Today we have
  // no inline scripts in this layout, but reading + reflecting the value
  // keeps the wiring honest and makes it a one-line change to add an inline
  // tag later (e.g. analytics bootstrapping) without revisiting middleware.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html
      lang="en"
      className={`${barlow.variable} ${barlowCondensed.variable} ${inter.variable} ${sourceSerif.variable} ${jetbrainsMono.variable} ${archivoNarrow.variable} ${fraunces.variable}`}
      data-csp-nonce={nonce}
    >
      <body>
        {/* Site-wide structured data — the publisher entity and the product
            it offers. Once, in the root layout, so every page inherits it. */}
        <JsonLd data={organizationSchema()} />
        <JsonLd data={softwareApplicationSchema()} />
        {/* Credentialed author entity (E-E-A-T). Declared once; article
            authors share its @id so the person consolidates. */}
        <JsonLd data={personNode()} />
        <a href="#main" className="skip-to-main">
          Skip to main content
        </a>
        {children}
        {/* Cookieless, privacy-respecting analytics — no consent banner. */}
        <Analytics />
      </body>
    </html>
  );
}
