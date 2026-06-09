// Marketing route fonts — flostruction-v5.html:10 (Google Fonts link)
// translated to next/font/google so the visitor never calls
// fonts.googleapis.com at runtime (same policy as src/app/layout.tsx).
//
// Scoped to the marketing surface: these variables are applied on the
// marketing page wrapper (src/components/marketing/MarketingPage.tsx),
// not on <html>, so no other route pays for them.
//
// JetBrains Mono is NOT loaded here — it is already self-hosted
// globally by src/app/layout.tsx as --font-jetbrains-mono (do not
// double-load; brief, Architecture Decisions "Fonts").
import {
  Saira_Condensed,
  Hanken_Grotesk,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
} from 'next/font/google';

export const sairaCondensed = Saira_Condensed({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-saira-condensed',
  display: 'swap',
});

export const hankenGrotesk = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-hanken-grotesk',
  display: 'swap',
});

export const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

export const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-sans',
  display: 'swap',
});

export const marketingFontClasses = [
  sairaCondensed.variable,
  hankenGrotesk.variable,
  ibmPlexMono.variable,
  ibmPlexSans.variable,
].join(' ');
