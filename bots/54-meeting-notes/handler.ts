// Bot 54 — Meeting notes.
//
// Trigger: transcript upload/webhook | Runtime: EF + pgmq | Gate: T1 | Model:
// Sonnet (summarise + extract actions). Sonnet writes the summary; the
// structured extraction of explicit action lines is deterministic and tested,
// so actions and decisions are reliably filed.

export const BOT_ID = 'bot-54-meeting-notes';

export interface ActionItem {
  owner: string | null;
  task: string;
}

export interface Decision {
  text: string;
}

const ACTION_RE = /^\s*(?:action|todo|ai)\s*[:\-]\s*(.+)$/i;
const DECISION_RE = /^\s*(?:decision|decided|resolved)\s*[:\-]\s*(.+)$/i;
const OWNER_RE = /@(\w[\w.-]*)/;

/** Pure: extract explicit action items from transcript lines. */
export function extractActions(lines: ReadonlyArray<string>): ActionItem[] {
  const out: ActionItem[] = [];
  for (const line of lines) {
    const m = line.match(ACTION_RE);
    if (!m) continue;
    const task = m[1]!.trim();
    const owner = task.match(OWNER_RE)?.[1] ?? null;
    out.push({
      owner,
      task: task
        .replace(OWNER_RE, '')
        .replace(/\s{2,}/g, ' ')
        .trim(),
    });
  }
  return out;
}

/** Pure: extract explicit decisions from transcript lines. */
export function extractDecisions(lines: ReadonlyArray<string>): Decision[] {
  const out: Decision[] = [];
  for (const line of lines) {
    const m = line.match(DECISION_RE);
    if (m) out.push({ text: m[1]!.trim() });
  }
  return out;
}
