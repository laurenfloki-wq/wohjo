/**
 * /field/rights — Your rights as a worker
 * Public page — no auth gating.
 * Reads src/content/worker/your-rights.md and renders via renderMarkdown().
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';
import RightsCards from '@/components/field/RightsCards';

export const metadata: Metadata = {
  title: 'Your rights as a worker — FLOSTRUCTION',
};

const PAGE_STYLES = {
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

export default function RightsPage() {
  // CRACK 222 / DEV-2 — render the 8 rights as discrete cards rather than
  // an undifferentiated markdown scroll. Each H2 right gets its own card;
  // the **Legal basis:** paragraph is split into a distinct legal-grounding
  // block to make the legal citation immediately scannable.
  const source = readFileSync(join(process.cwd(), 'src/content/worker/your-rights.md'), 'utf-8');

  return (
    <div style={PAGE_STYLES.page}>
      <div style={PAGE_STYLES.inner}>
        <h1
          style={{
            fontFamily: 'var(--font-source-serif, "IBM Plex Serif", Georgia, serif)',
            fontSize: 22,
            fontWeight: 700,
            color: '#0E1C2F',
            marginTop: 0,
            marginBottom: '0.6em',
            lineHeight: 1.3,
          }}
        >
          Your rights as a FLOSTRUCTION worker
        </h1>
        <div style={PAGE_STYLES.body}>
          <style>{`
            .advocacy-page p { margin: 0 0 10px; }
            .advocacy-page p:last-child { margin-bottom: 0; }
            .advocacy-page a { color: #0E1C2F; text-decoration: underline; }
          `}</style>
          <RightsCards source={source} />
        </div>

        <div style={PAGE_STYLES.seeAlso}>
          <div style={PAGE_STYLES.seeAlsoHeading}>See also</div>
          <a href="/field/faq" style={PAGE_STYLES.link}>
            Worker FAQ
          </a>
          <a href="/field/seal" style={PAGE_STYLES.link}>
            How records are sealed
          </a>
        </div>
      </div>
    </div>
  );
}
