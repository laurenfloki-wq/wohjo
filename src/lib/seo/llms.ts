// llms.txt generator (https://llmstxt.org / AnswerDotAI/llms-txt).
//
// A curated, machine-readable index of the site for LLMs and answer
// engines: an H1, a one-line authority blockquote, and grouped links. The
// link set comes from the SAME single source as sitemap.xml and the
// IndexNow ping (getIndexableRoutes), so adding a guide to the registry
// surfaces it in all three with no extra edits.

import { ORG } from './site';
import { getIndexableRoutes, type RouteGroup } from './routes';

// Section order in the document.
const GROUP_ORDER: RouteGroup[] = ['Core', 'Guides', 'WLES'];

// One-line authority summary, sourced from the organisation/product facts.
// What it is and who it serves — no ratings, no customers.
const SUMMARY =
  `${ORG.name} builds Flostruction — time verification for Australian construction and labour hire. ` +
  'Worked hours are confirmed on site, approved by the supervisor, and sealed into a permanent, ' +
  'tamper-evident record under the Workforce Ledger Evidentiary Standard (WLES) before payroll.';

export function renderLlmsTxt(): string {
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

  return `${lines.join('\n')}\n`;
}
