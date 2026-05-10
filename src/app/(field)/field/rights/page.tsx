/**
 * /field/rights — Your rights as a worker
 * Public page — no auth gating.
 * Reads src/content/worker/your-rights.md and renders via renderMarkdown().
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';
import { renderMarkdown } from '@/lib/render-markdown';

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
  const source = readFileSync(join(process.cwd(), 'src/content/worker/your-rights.md'), 'utf-8');

  const content = renderMarkdown(source);

  return (
    <div style={PAGE_STYLES.page}>
      <div style={PAGE_STYLES.inner}>
        <div style={PAGE_STYLES.body}>
          <style>{`
            .advocacy-page h1 {
              font-family: var(--font-source-serif, "IBM Plex Serif", Georgia, serif);
              font-size: 22px;
              font-weight: 700;
              color: #0E1C2F;
              margin-top: 0;
              margin-bottom: 0.6em;
              line-height: 1.3;
            }
            .advocacy-page h2 {
              font-family: var(--font-source-serif, "IBM Plex Serif", Georgia, serif);
              font-size: 19px;
              font-weight: 700;
              color: #0E1C2F;
            }
            .advocacy-page h3 {
              font-family: var(--font-inter, "IBM Plex Sans", system-ui, sans-serif);
              font-size: 16px;
              font-weight: 700;
              color: #0E1C2F;
            }
          `}</style>
          <div className="advocacy-page">{content}</div>
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
