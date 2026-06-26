#!/usr/bin/env node
// AI-crawler log readout — counts hits from AI search/retrieval crawlers in
// an exported access log. Bounded, no network, no secrets.
//
// Vercel runtime/access logs are not readable from inside the repo at build
// time (short retention; the full access log needs the dashboard or a Log
// Drain). So this script operates on an EXPORTED log file you provide:
//
//   node scripts/ai-crawler-log-readout.mjs <path-to-log>
//
// The log can be NDJSON (Vercel Log Drain / "Download" export) or plain
// text — each AI user-agent is matched as a substring of the line, which
// works for both formats.
//
// HOW TO GET THE LOG (manual, documented for the PR):
//   - Vercel dashboard → Project → Observability / Logs → filter and Export,
//     OR configure a Log Drain (Settings → Log Drains) to your store and
//     export an NDJSON file.
//   - Or `vercel logs <deployment-url>` (recent runtime logs only).
//
// CROSSREF the roster periodically against:
//   - https://darkvisitors.com/agents
//   - https://github.com/ai-robots-txt/ai.robots.txt
// and update AI_USER_AGENTS below if the ecosystem changes.

import { readFileSync } from 'node:fs';

// Roster as at 2026-06 (verify against the sources above).
const AI_USER_AGENTS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Googlebot',
  'Bingbot',
  'Amazonbot',
  'Bytespider',
  'Meta-ExternalAgent',
];

function usage() {
  console.log('Usage: node scripts/ai-crawler-log-readout.mjs <path-to-exported-log>');
  console.log('');
  console.log('Counts hits from these AI crawler user-agents:');
  console.log('  ' + AI_USER_AGENTS.join(', '));
  console.log('');
  console.log('No log handy? Export one from Vercel → Observability/Logs, or set up a');
  console.log('Log Drain, then pass the file. See the header of this script for details.');
}

function main() {
  const file = process.argv[2];
  if (!file) {
    usage();
    process.exit(0);
  }

  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    console.error(`[readout] could not read ${file}:`, err.message);
    process.exit(1);
  }

  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const counts = new Map(AI_USER_AGENTS.map((ua) => [ua, 0]));

  for (const line of lines) {
    const lower = line.toLowerCase();
    for (const ua of AI_USER_AGENTS) {
      // Match the UA token as a substring (works for JSON and text logs).
      if (lower.includes(ua.toLowerCase())) counts.set(ua, counts.get(ua) + 1);
    }
  }

  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const totalAi = rows.reduce((n, [, c]) => n + c, 0);

  console.log(`AI-crawler log readout — ${file}`);
  console.log(`Lines scanned: ${lines.length}`);
  console.log('');
  const width = Math.max(...AI_USER_AGENTS.map((u) => u.length));
  for (const [ua, c] of rows) {
    console.log(`  ${ua.padEnd(width)}  ${c}`);
  }
  console.log('');
  console.log(`Total AI-crawler hits: ${totalAi}`);
}

main();
