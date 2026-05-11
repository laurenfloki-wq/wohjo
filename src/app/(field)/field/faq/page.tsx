/**
 * /field/faq — Worker FAQ
 * Public page — no auth gating.
 * Reads src/content/worker/faq.md and renders via renderMarkdown().
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';
import FaqAccordion from '@/components/field/FaqAccordion';

export const metadata: Metadata = {
  title: 'Worker FAQ — FLOSTRUCTION',
};

const NAV_STYLES = {
  page: {
    background: '#F5F2EA',
    minHeight: '100vh',
    fontFamily: 'var(--font-inter, "IBM Plex Sans", system-ui, sans-serif)',
    color: '#0E1C2F',
  } as React.CSSProperties,

  inner: {
    maxWidth: '640px',
    margin: '0 auto',
    padding: '20px 20px 60px',
  } as React.CSSProperties,

  h1Override: {
    fontFamily: 'var(--font-source-serif, "IBM Plex Serif", Georgia, serif)',
    fontSize: '22px',
    fontWeight: 700,
    color: '#0E1C2F',
    marginTop: 0,
    marginBottom: '0.6em',
    lineHeight: 1.3,
  } as React.CSSProperties,

  body: {
    fontSize: '16px',
    lineHeight: 1.6,
    color: '#0E1C2F',
  } as React.CSSProperties,

  seeAlso: {
    marginTop: '40px',
    paddingTop: '20px',
    borderTop: '1px solid #D9D5CB',
    fontSize: '15px',
  } as React.CSSProperties,

  seeAlsoHeading: {
    fontWeight: 700,
    marginBottom: '10px',
    color: '#0E1C2F',
  } as React.CSSProperties,

  link: {
    display: 'block',
    color: '#0E1C2F',
    textDecoration: 'underline',
    marginBottom: '8px',
    padding: '4px 0',
  } as React.CSSProperties,
} as const;

export default function FaqPage() {
  // CRACK 222 / DEV-1 — render the FAQ as an accessible accordion (native
  // <details>/<summary>) rather than a long markdown scroll. Each H3
  // question becomes its own collapsible row with a 56px tap target.
  const source = readFileSync(join(process.cwd(), 'src/content/worker/faq.md'), 'utf-8');

  return (
    <div style={NAV_STYLES.page}>
      <div style={NAV_STYLES.inner}>
        <h1 style={NAV_STYLES.h1Override}>Worker FAQ</h1>
        <div style={NAV_STYLES.body}>
          <style>{`
            .advocacy-page p { margin: 0 0 10px; }
            .advocacy-page p:last-child { margin-bottom: 0; }
            .advocacy-page a { color: #0E1C2F; text-decoration: underline; }
          `}</style>
          <FaqAccordion source={source} />
        </div>

        <div style={NAV_STYLES.seeAlso}>
          <div style={NAV_STYLES.seeAlsoHeading}>See also</div>
          <a href="/field/seal" style={NAV_STYLES.link}>
            How records are sealed
          </a>
          <a href="/field/rights" style={NAV_STYLES.link}>
            Your rights as a worker
          </a>
        </div>
      </div>
    </div>
  );
}
