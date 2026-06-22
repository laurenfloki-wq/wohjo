// GitHub connector — typed fetch wrapper with a scoped PAT.
// Used by bot 39 (R&D evidence) and engineering bots that need commit data.

import { requireEnv } from '../env';

const GITHUB_API = 'https://api.github.com';

async function gh<T>(path: string): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      authorization: `Bearer ${requireEnv('GITHUB_FLEET_TOKEN')}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`GitHub ${path} -> ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export interface GitCommit {
  sha: string;
  message: string;
  date: string;
}

/** List commits on a repo since an ISO date (one page). */
export async function listCommits(
  owner: string,
  repo: string,
  sinceIso: string,
): Promise<GitCommit[]> {
  const raw = await gh<
    Array<{ sha: string; commit: { message: string; author: { date: string } } }>
  >(`/repos/${owner}/${repo}/commits?since=${encodeURIComponent(sinceIso)}&per_page=100`);
  return raw.map((c) => ({ sha: c.sha, message: c.commit.message, date: c.commit.author.date }));
}

/**
 * Pure: classify a commit as R&D-eligible activity by conventional-commit type.
 * feat/perf/refactor of product code are experimental development; chore/docs
 * are not. The cost is attached separately (from payroll/Xero), not here.
 */
export function isRdEligibleCommit(message: string): boolean {
  return /^(feat|perf|refactor)(\([^)]*\))?!?:/i.test(message.trim());
}
