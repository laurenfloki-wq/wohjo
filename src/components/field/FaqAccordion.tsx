/**
 * FaqAccordion — server component (DEV-1, CRACK 222).
 *
 * Renders the worker FAQ as an accessible accordion. Uses native
 * <details>/<summary> for built-in keyboard + screen-reader accordion
 * semantics; no client state required.
 *
 * Tap target: each <summary> is min-height 56px per the dispatch
 * (mobile-first; matches the WCAG 2.1 AAA recommendation of >= 44pt
 * with comfortable surrounding padding). Default styling collapses each
 * row to title-only and reveals body on expand.
 *
 * Input: the raw markdown source of faq.md. The component splits on
 * `### ` headings (each Q in the source is an H3) and renders one
 * <details> per question. Anything before the first H3 (the intro
 * lines like "Last updated:" + "Audience:") is rendered above the
 * accordion as plain markdown.
 */

import { renderMarkdown } from '@/lib/render-markdown';
import { parseSections } from '@/lib/content/parse-sections';

const SUMMARY_STYLE: React.CSSProperties = {
  // Native <summary> elements have a default disclosure triangle marker.
  // We hide it via `listStyle: 'none'` + ::-webkit-details-marker (in
  // the embedded <style>) and use our own caret span instead.
  listStyle: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  minHeight: 56,
  padding: '14px 16px',
  fontFamily: 'var(--font-source-serif, "IBM Plex Serif", Georgia, serif)',
  fontSize: 17,
  fontWeight: 700,
  color: '#0E1C2F',
  lineHeight: 1.35,
  outline: 'none',
};

const DETAILS_STYLE: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #D9D5CB',
  borderRadius: 8,
  marginBottom: 10,
  overflow: 'hidden',
};

const PANEL_STYLE: React.CSSProperties = {
  padding: '0 16px 18px',
  fontSize: 16,
  lineHeight: 1.6,
  color: '#0E1C2F',
  fontFamily: 'var(--font-inter, "IBM Plex Sans", system-ui, sans-serif)',
};

const CARET_STYLE: React.CSSProperties = {
  flexShrink: 0,
  fontFamily: 'var(--font-inter, "IBM Plex Sans", system-ui, sans-serif)',
  fontWeight: 400,
  fontSize: 16,
  color: '#0E1C2F',
  opacity: 0.6,
};

const INTRO_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-inter, "IBM Plex Sans", system-ui, sans-serif)',
  fontSize: 15,
  color: '#0E1C2F',
  marginBottom: 16,
  opacity: 0.85,
};

export default function FaqAccordion({ source }: { source: string }) {
  const { intro, sections } = parseSections(source, 3);

  return (
    <div data-testid="faq-accordion">
      {/* Hide the native disclosure marker — we render our own caret. */}
      <style>{`
        details.faq-row > summary::-webkit-details-marker { display: none; }
        details.faq-row > summary { list-style: none; }
        details.faq-row[open] .faq-caret { transform: rotate(180deg); }
        details.faq-row .faq-caret { transition: transform 120ms ease; display: inline-block; }
        details.faq-row > summary:focus-visible {
          outline: 2px solid #0E1C2F;
          outline-offset: -2px;
        }
        details.faq-row .faq-panel p { margin: 0 0 10px; }
        details.faq-row .faq-panel p:last-child { margin-bottom: 0; }
      `}</style>

      {intro && (
        <div style={INTRO_STYLE} className="advocacy-page">
          {renderMarkdown(intro)}
        </div>
      )}

      {sections.map((section, i) => (
        <details key={i} className="faq-row" style={DETAILS_STYLE}>
          <summary style={SUMMARY_STYLE}>
            <span>{section.title}</span>
            <span aria-hidden="true" className="faq-caret" style={CARET_STYLE}>
              ▾
            </span>
          </summary>
          <div className="faq-panel advocacy-page" style={PANEL_STYLE}>
            {renderMarkdown(section.body)}
          </div>
        </details>
      ))}
    </div>
  );
}
