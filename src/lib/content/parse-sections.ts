/**
 * Parse a markdown source into sections split on a given heading level.
 *
 * Used by the worker advocacy pages (CRACK 222):
 *   - FAQ accordion splits on `### ` (H3) — each question becomes an
 *     accordion row.
 *   - Rights cards splits on `## ` (H2, numeric leading) — each right
 *     becomes a card.
 *
 * The intro (anything before the first heading at the requested level)
 * is returned separately so the caller can render it ABOVE the accordion
 * or card grid.
 *
 * Output is plain text with the heading-marker stripped from the title;
 * the body is the rest of the section (Markdown source). Callers can
 * render the body with renderMarkdown() if they want rich formatting.
 *
 * No regex on the body — section termination is the next heading at the
 * SAME level (subordinate headings stay inside the parent section).
 */

export interface MarkdownSection {
  /** Heading text with the `### ` / `## ` etc prefix removed and trimmed. */
  title: string;
  /** Section body in raw Markdown (everything after the heading line,
   *  up to the next heading at the same level OR end of file). */
  body: string;
}

export interface ParsedSections {
  /** Everything before the first heading at the requested level. May be empty. */
  intro: string;
  sections: MarkdownSection[];
}

export function parseSections(source: string, level: 2 | 3): ParsedSections {
  const prefix = level === 2 ? '## ' : '### ';
  const lines = source.split('\n');

  const intro: string[] = [];
  const sections: MarkdownSection[] = [];
  let current: { title: string; lines: string[] } | null = null;
  let inH1 = false; // skip H1 block (page title only)

  for (const line of lines) {
    // H1: not a section boundary; never matters here. Skip H1 line so
    // it doesn't appear in intro either — pages render their own title.
    if (line.startsWith('# ') && !line.startsWith(prefix)) {
      inH1 = true;
      continue;
    }
    if (inH1 && line.trim() === '') {
      inH1 = false;
      continue;
    }
    if (inH1) continue;

    if (line.startsWith(prefix)) {
      if (current) {
        sections.push({ title: current.title, body: current.lines.join('\n').trim() });
      }
      current = { title: line.slice(prefix.length).trim(), lines: [] };
      continue;
    }

    if (current === null) {
      intro.push(line);
    } else {
      current.lines.push(line);
    }
  }

  if (current) {
    sections.push({ title: current.title, body: current.lines.join('\n').trim() });
  }

  return { intro: intro.join('\n').trim(), sections };
}

/**
 * Extract a leading paragraph that begins with `**Legal basis:**` (or
 * a similarly bolded label) from a section body. Returns the legal
 * basis paragraph and the rest of the body separately so the renderer
 * can style the legal basis distinctly.
 *
 * The legal-basis paragraph is the LAST paragraph in every right's
 * body per the your-rights.md convention. We scan from the end.
 */
export function splitLegalBasis(body: string): { main: string; legalBasis: string | null } {
  const lines = body.split('\n');
  // Find the last paragraph that starts with **Legal basis:**.
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith('**Legal basis:**')) {
      // Walk back to the previous blank line to find the paragraph start.
      let start = i;
      while (start > 0 && lines[start - 1].trim() !== '') start--;
      // Walk forward to find the paragraph end.
      let end = i;
      while (end < lines.length - 1 && lines[end + 1].trim() !== '') end++;
      const legalBasis = lines
        .slice(start, end + 1)
        .join('\n')
        .trim();
      // Main body = everything except those lines, trimmed.
      const mainLines = lines.slice(0, start).join('\n').trim();
      // Anything after the legal basis is preserved verbatim (rare).
      const trailingLines = lines
        .slice(end + 1)
        .join('\n')
        .trim();
      const main = trailingLines ? `${mainLines}\n\n${trailingLines}`.trim() : mainLines;
      return { main, legalBasis };
    }
  }
  return { main: body, legalBasis: null };
}

/**
 * Extract the first paragraph from a markdown source, skipping any
 * leading H1 and blank lines. Used by SealExpandable to mirror the
 * first paragraph of what-is-the-seal.md.
 */
export function extractFirstParagraph(source: string): string {
  const lines = source.split('\n');
  const paraLines: string[] = [];
  let started = false;
  for (const line of lines) {
    if (line.startsWith('#')) {
      if (started) break;
      continue;
    }
    if (line.trim() === '') {
      if (started) break;
      continue;
    }
    started = true;
    paraLines.push(line.trim());
  }
  return paraLines.join(' ').trim();
}
