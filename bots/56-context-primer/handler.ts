// Bot 56 — Context primer maintenance.
//
// Trigger: canonical-pack change (repo push) | Runtime: GitHub Actions | Gate:
// T1 | Model: Sonnet (update Notion primer). Diffs the canonical pack; Sonnet
// updates the primer so other bots stay grounded. The diff is deterministic.

export const BOT_ID = 'bot-56-context-primer';

export interface PackDiff {
  added: string[];
  removed: string[];
  changed: string[];
}

/**
 * Pure: diff two versions of the canonical pack (section key -> content hash).
 * Returns the section keys added, removed, or changed. An empty diff means the
 * primer needs no update (no wasted LLM call).
 */
export function diffPack(
  previous: ReadonlyMap<string, string>,
  current: ReadonlyMap<string, string>,
): PackDiff {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const [key, hash] of current) {
    if (!previous.has(key)) added.push(key);
    else if (previous.get(key) !== hash) changed.push(key);
  }
  for (const key of previous.keys()) {
    if (!current.has(key)) removed.push(key);
  }
  return {
    added: added.sort(),
    removed: removed.sort(),
    changed: changed.sort(),
  };
}

/** Pure: is an update needed at all? */
export function hasChanges(d: PackDiff): boolean {
  return d.added.length > 0 || d.removed.length > 0 || d.changed.length > 0;
}
