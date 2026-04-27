#!/usr/bin/env node
// ---------------------------------------------------------------------
// Generate src/app/privacy/page.tsx + src/app/terms/page.tsx
// from Lauren's reviewed .docx sources.
//
// Process:
//   1. Read the python-docx-extracted .txt files (heading-styled)
//   2. Convert structural markers to JSX:
//        [H1] foo  → <h1 style={styles.mainTitle}>foo</h1>
//        [H2] foo  → <h2 style={styles.heading}>foo</h2>
//        [H3] foo  → <h3 style={styles.subheading}>foo</h3>
//        [List Paragraph] foo  → <li>foo</li>
//        plain text  → <p>foo</p>
//   3. Apply transforms:
//        - Strip the "DRAFT" disclaimer at top
//        - Strip the meta line "Effective Date: ... Published at: ..."
//          (regenerated below with current values)
//        - Replace "ACN to be assigned" → "ACN 697 323 925"
//        - Replace "[Australian Capital Territory address to be
//          confirmed on incorporation]" → "55 Reginald Road,
//          Googong NSW 2620"
//        - Drop the trailing "End of Privacy Policy. Version 1.0
//          effective 20 April 2026..." line (regenerated)
//   4. Wrap in the existing page.tsx scaffold + styles object
//   5. Insert effective-date metadata at top:
//        FLOSMOSIS PTY LTD · ACN 697 323 925
//        Effective: 27 April 2026 · Version 1.0 · Last Updated: 27 April 2026
//
// Usage:
//   node scripts/generate-legal-pages.mjs
//
// Re-runnable: overwrites src/app/privacy/page.tsx and
// src/app/terms/page.tsx. Both files are tracked in git so any
// regeneration is reviewable as a diff.
// ---------------------------------------------------------------------

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

// Source paths (Cowork-extracted from FLOSMOSIS/legal/*.docx)
const PRIVACY_SOURCE = '/sessions/admiring-wizardly-archimedes/legal-extracted/Privacy-Policy.txt';
const TERMS_SOURCE   = '/sessions/admiring-wizardly-archimedes/legal-extracted/Terms-of-Service.txt';

// Output paths
const PRIVACY_OUT = resolve(REPO_ROOT, 'src/app/privacy/page.tsx');
const TERMS_OUT   = resolve(REPO_ROOT, 'src/app/terms/page.tsx');

// Constants applied to BOTH pages
const ACN = '697 323 925';
const ABN = '80 697 323 925';
const EFFECTIVE_DATE = '27 April 2026';
const REGISTERED_OFFICE = '55 Reginald Road, Googong NSW 2620';
const VERSION = '1.0';

// Strings stripped or replaced from source
const STRIP_LINES = [
  /^DRAFT/i,                                   // top draft disclaimer
  /^Effective Date:.*Published at:/i,          // top meta line (regenerated)
  /^End of (Privacy Policy|Terms of Service)/i, // trailing close line
];
const REPLACEMENTS = [
  [/ACN to be assigned/g, `ACN ${ACN}`],
  [/\(ACN to be assigned;/g, `(ACN ${ACN};`],
  [/\[Australian Capital Territory address to be confirmed on incorporation\]/g, REGISTERED_OFFICE],
];

// Escape JSX-special characters in a text fragment (apostrophes, less-
// than, greater-than, ampersand, braces). Newlines become spaces — we
// already have line-level paragraph splits.
function escapeJsx(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&apos;')
    .replace(/"/g, '&quot;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;');
}

// Parse one source .txt into a sequence of blocks.
// Block types: { kind: 'h1'|'h2'|'h3', text } | { kind: 'p', text } |
//              { kind: 'li', text } | { kind: 'blank' }
function parseSource(text) {
  const blocks = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) {
      blocks.push({ kind: 'blank' });
      continue;
    }
    if (STRIP_LINES.some((re) => re.test(line))) continue;

    // Apply text replacements
    let cleaned = line;
    for (const [from, to] of REPLACEMENTS) {
      cleaned = cleaned.replace(from, to);
    }

    if (cleaned.startsWith('[H1] ')) {
      blocks.push({ kind: 'h1', text: cleaned.slice(5) });
    } else if (cleaned.startsWith('[H2] ')) {
      blocks.push({ kind: 'h2', text: cleaned.slice(5) });
    } else if (cleaned.startsWith('[H3] ')) {
      blocks.push({ kind: 'h3', text: cleaned.slice(5) });
    } else if (cleaned.startsWith('[List Paragraph] ')) {
      blocks.push({ kind: 'li', text: cleaned.slice('[List Paragraph] '.length) });
    } else {
      blocks.push({ kind: 'p', text: cleaned });
    }
  }
  return blocks;
}

// Group consecutive 'li' blocks into a single 'ul' for clean JSX.
function groupLists(blocks) {
  const out = [];
  let buffer = null;
  for (const b of blocks) {
    if (b.kind === 'li') {
      if (!buffer) buffer = { kind: 'ul', items: [] };
      buffer.items.push(b.text);
    } else {
      if (buffer) {
        out.push(buffer);
        buffer = null;
      }
      out.push(b);
    }
  }
  if (buffer) out.push(buffer);
  return out;
}

// Render a block sequence as JSX body lines.
function renderBlocks(blocks) {
  const lines = [];
  for (const b of blocks) {
    switch (b.kind) {
      case 'blank':
        lines.push('');
        break;
      case 'h1':
        // Skip — page generates its own H1 from title constant
        break;
      case 'h2':
        lines.push(`        <h2 style={styles.heading}>${escapeJsx(b.text)}</h2>`);
        break;
      case 'h3':
        lines.push(`        <h3 style={styles.subheading}>${escapeJsx(b.text)}</h3>`);
        break;
      case 'p':
        lines.push(`        <p>${escapeJsx(b.text)}</p>`);
        break;
      case 'ul':
        lines.push(`        <ul style={styles.list}>`);
        for (const item of b.items) {
          lines.push(`          <li>${escapeJsx(item)}</li>`);
        }
        lines.push(`        </ul>`);
        break;
    }
  }
  return lines.join('\n');
}

// Wrap rendered blocks in the page scaffold.
function wrap(opts) {
  const { title, kind, body } = opts;
  return `// Auto-generated by scripts/generate-legal-pages.mjs from
// FLOSMOSIS/legal/${kind === 'privacy' ? 'Privacy-Policy' : 'Terms-of-Service'}.docx.
// Re-run the generator after any source-document update.
//
// Effective ${EFFECTIVE_DATE} · Version ${VERSION} · ACN ${ACN}.

import type { CSSProperties } from 'react';

export default function ${kind === 'privacy' ? 'PrivacyPage' : 'TermsPage'}() {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <a href="/" style={styles.backButton}>← Back</a>
        <div style={styles.updatedText}>Last updated: ${EFFECTIVE_DATE}</div>
      </div>

      <div style={styles.content}>
        <h1 style={styles.mainTitle}>${title}</h1>

        <div style={styles.subtitle}>
          <p><strong>FLOSMOSIS PTY LTD</strong></p>
          <p><strong>ACN ${ACN}</strong> · <strong>ABN ${ABN}</strong></p>
          <p>Registered office: ${REGISTERED_OFFICE}</p>
        </div>

        <p><strong>Effective Date:</strong> ${EFFECTIVE_DATE}<br />
        <strong>Version:</strong> ${VERSION}<br />
        <strong>Last Updated:</strong> ${EFFECTIVE_DATE}</p>

        <hr style={styles.divider} />

${body}

      </div>
    </div>
  );
}

const styles: { [key: string]: CSSProperties } = {
  container: {
    backgroundColor: '#0a0a1a',
    color: 'rgba(255, 255, 255, 0.85)',
    minHeight: '100vh',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    lineHeight: '1.6',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '40px',
    maxWidth: '800px',
    margin: '0 auto 40px',
  },
  backButton: {
    color: '#888',
    textDecoration: 'none',
    fontSize: '16px',
    transition: 'color 0.2s',
  },
  updatedText: {
    fontSize: '12px',
    color: '#666',
  },
  content: {
    maxWidth: '800px',
    margin: '0 auto',
  },
  mainTitle: {
    fontSize: '32px',
    color: 'white',
    marginBottom: '20px',
    marginTop: '0',
  },
  subtitle: {
    marginBottom: '20px',
  },
  heading: {
    fontSize: '18px',
    color: 'white',
    marginTop: '30px',
    marginBottom: '15px',
    fontWeight: 'bold',
  },
  subheading: {
    fontSize: '16px',
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: '20px',
    marginBottom: '10px',
    fontWeight: '600',
  },
  divider: {
    borderColor: 'rgba(255, 255, 255, 0.1)',
    margin: '30px 0',
  },
  list: {
    marginLeft: '20px',
    marginBottom: '15px',
  },
};
`;
}

function build(srcPath, outPath, title, kind) {
  const text = readFileSync(srcPath, 'utf8');
  const blocks = parseSource(text);
  const grouped = groupLists(blocks);
  const body = renderBlocks(grouped);
  const out = wrap({ title, kind, body });
  writeFileSync(outPath, out, 'utf8');
  console.log(`✓ wrote ${outPath} (${grouped.length} blocks)`);
}

build(PRIVACY_SOURCE, PRIVACY_OUT, 'FLOSMOSIS.COM PRIVACY POLICY', 'privacy');
build(TERMS_SOURCE,   TERMS_OUT,   'FLOSMOSIS.COM TERMS OF SERVICE', 'terms');

console.log(`
Generated:
  ${PRIVACY_OUT}
  ${TERMS_OUT}

Both pages carry:
  ACN ${ACN} · ABN ${ABN}
  Effective ${EFFECTIVE_DATE} · Version ${VERSION}
  Registered office: ${REGISTERED_OFFICE}
`);
