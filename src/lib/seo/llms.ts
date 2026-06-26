// llms.txt + llms-full.txt generators (https://llmstxt.org /
// AnswerDotAI/llms-txt).
//
// A curated, machine-readable index of the site for LLMs and answer
// engines: an H1, a one-line authority blockquote, and grouped links. The
// link set comes from the SAME single source as sitemap.xml and the
// IndexNow ping (getIndexableRoutes), so adding a page surfaces it in all
// of them with no extra edits.
//
// llms-full.txt is the expanded variant: the same index plus the full
// extractable answer for every labour hire licensing jurisdiction (the
// highest-value content), generated from the same LICENCE_STATES data so
// it cannot drift.

import { ORG, abs } from './site';
import { getIndexableRoutes, type RouteGroup } from './routes';
import { LICENCE_STATES, licenceStatePath } from './labour-hire-licence';

// Section order in the document.
const GROUP_ORDER: RouteGroup[] = ['Core', 'Guides', 'Licensing', 'WLES'];

// One-line authority summary, sourced from the organisation/product facts.
// What it is and who it serves — no ratings, no customers.
const SUMMARY =
  `${ORG.name} builds Flostruction — time verification for Australian construction and labour hire. ` +
  'Worked hours are confirmed on site, approved by the supervisor, and sealed into a permanent, ' +
  'tamper-evident record under the Workforce Ledger Evidentiary Standard (WLES) before payroll.';

/** Header (H1 + authority blockquote) + the grouped link sections. */
function indexLines(): string[] {
  const routes = getIndexableRoutes();
  const lines: string[] = ['# FLOSMOSIS — Flostruction', '', `> ${SUMMARY}`];

  for (const group of GROUP_ORDER) {
    const inGroup = routes.filter((r) => r.group === group);
    if (inGroup.length === 0) continue;
    lines.push('', `## ${group}`);
    for (const r of inGroup) {
      lines.push(`- [${r.title}](${r.url}): ${r.description}`);
    }
  }
  return lines;
}

export function renderLlmsTxt(): string {
  return `${indexLines().join('\n')}\n`;
}

export function renderLlmsFullTxt(): string {
  const lines = indexLines();

  // Expanded appendix: the full extractable answer + cross-border note +
  // sources for every labour hire licensing jurisdiction.
  lines.push('', '## Labour hire licensing — answers by jurisdiction');
  for (const s of LICENCE_STATES) {
    lines.push('', `### Do you need a labour hire licence in ${s.state}? (${s.abbr})`);
    lines.push(abs(licenceStatePath(s.slug)));
    lines.push('', s.answer);
    lines.push('', `Cross-border: ${s.crossBorder}`);
    lines.push('', `Sources: ${s.sources.map((src) => `${src.label} — ${src.url}`).join('; ')}`);
  }

  return `${lines.join('\n')}\n`;
}
