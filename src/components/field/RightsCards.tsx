/**
 * RightsCards — server component (DEV-2, CRACK 222).
 *
 * Renders the 8 worker rights as visually-distinct cards. Each card has:
 *   - the right's number + title (H2 in markdown source)
 *   - the body explanation
 *   - the **Legal basis:** paragraph rendered in its own bordered block
 *     so the legal grounding reads distinctly from the plain-language
 *     explanation
 *
 * Input: raw markdown source of your-rights.md. Splits on `## `
 * headings; intro paragraph rendered above the card grid.
 */

import { renderMarkdown } from '@/lib/render-markdown';
import { parseSections, splitLegalBasis } from '@/lib/content/parse-sections';

const INTRO_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-inter, "IBM Plex Sans", system-ui, sans-serif)',
  fontSize: 16,
  color: '#0E1C2F',
  lineHeight: 1.6,
  marginBottom: 24,
};

const CARD_STYLE: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #D9D5CB',
  borderRadius: 10,
  padding: '20px 18px 18px',
  marginBottom: 14,
};

const TITLE_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-source-serif, "IBM Plex Serif", Georgia, serif)',
  fontSize: 19,
  fontWeight: 700,
  color: '#0E1C2F',
  margin: '0 0 12px',
  lineHeight: 1.3,
};

const BODY_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-inter, "IBM Plex Sans", system-ui, sans-serif)',
  fontSize: 16,
  color: '#0E1C2F',
  lineHeight: 1.6,
};

const LEGAL_BASIS_STYLE: React.CSSProperties = {
  marginTop: 14,
  padding: '12px 14px',
  background: '#F0EDE3',
  borderLeft: '3px solid #0E1C2F',
  borderRadius: 4,
  fontFamily: 'var(--font-inter, "IBM Plex Sans", system-ui, sans-serif)',
  fontSize: 14,
  lineHeight: 1.55,
  color: '#0E1C2F',
};

export default function RightsCards({ source }: { source: string }) {
  const { intro, sections } = parseSections(source, 2);

  return (
    <div data-testid="rights-cards">
      <style>{`
        .rights-card .advocacy-page p:first-child { margin-top: 0; }
        .rights-card .advocacy-page p:last-child { margin-bottom: 0; }
        .rights-card .advocacy-page p { margin: 0 0 12px; }
        .rights-card .legal-basis p { margin: 0; }
        .rights-card .legal-basis strong { font-weight: 700; }
      `}</style>

      {intro && (
        <div style={INTRO_STYLE} className="advocacy-page rights-intro">
          {renderMarkdown(intro)}
        </div>
      )}

      {sections.map((section, i) => {
        const { main, legalBasis } = splitLegalBasis(section.body);
        return (
          <article key={i} className="rights-card" data-testid="rights-card" style={CARD_STYLE}>
            <h2 style={TITLE_STYLE}>{section.title}</h2>
            <div className="advocacy-page" style={BODY_STYLE}>
              {renderMarkdown(main)}
            </div>
            {legalBasis && (
              <div className="legal-basis" data-testid="legal-basis" style={LEGAL_BASIS_STYLE}>
                {renderMarkdown(legalBasis)}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
