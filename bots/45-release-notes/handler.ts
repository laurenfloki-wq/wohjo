// Bot 45 — Release notes.
//
// Trigger: release | Runtime: GitHub Actions | Gate: T1 | Model: Haiku
// (changelog prose). The PR categorisation (by conventional-commit prefix) is
// pure and deterministic; Haiku only smooths the prose. No emoji in output.

import { containsEmoji } from '../../platform/guard';

export const BOT_ID = 'bot-45-release-notes';

export interface PullRequest {
  number: number;
  title: string;
}

export type ChangeKind = 'feat' | 'fix' | 'perf' | 'docs' | 'chore' | 'other';

export interface CategorisedChangelog {
  feat: PullRequest[];
  fix: PullRequest[];
  perf: PullRequest[];
  docs: PullRequest[];
  chore: PullRequest[];
  other: PullRequest[];
}

/** Pure: derive the conventional-commit kind from a PR title. */
export function changeKind(title: string): ChangeKind {
  const m = title.match(/^(\w+)(?:\([^)]*\))?!?:/);
  const prefix = (m?.[1] ?? '').toLowerCase();
  if (
    prefix === 'feat' ||
    prefix === 'fix' ||
    prefix === 'perf' ||
    prefix === 'docs' ||
    prefix === 'chore'
  ) {
    return prefix;
  }
  return 'other';
}

/** Pure: group PRs into a changelog by kind. */
export function categorise(prs: ReadonlyArray<PullRequest>): CategorisedChangelog {
  const out: CategorisedChangelog = { feat: [], fix: [], perf: [], docs: [], chore: [], other: [] };
  for (const pr of prs) out[changeKind(pr.title)].push(pr);
  return out;
}

/** Render a deterministic markdown changelog. Asserts no emoji (output hygiene). */
export function renderChangelog(c: CategorisedChangelog): string {
  const sections: Array<[string, PullRequest[]]> = [
    ['Features', c.feat],
    ['Fixes', c.fix],
    ['Performance', c.perf],
    ['Docs', c.docs],
    ['Chores', c.chore],
    ['Other', c.other],
  ];
  const lines: string[] = [];
  for (const [heading, prs] of sections) {
    if (prs.length === 0) continue;
    lines.push(`## ${heading}`);
    for (const pr of prs) lines.push(`- ${pr.title} (#${pr.number})`);
    lines.push('');
  }
  const md = lines.join('\n').trimEnd();
  if (containsEmoji(md)) throw new Error('release notes must not contain emoji');
  return md;
}
