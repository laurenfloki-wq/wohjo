// Bot 3 — Content drafting.
//
// Trigger: manual/calendar | Runtime: EF (HTTP) | Gate: T2 publish |
// Model: Sonnet. Pulls a brief + voice rules and drafts LinkedIn + Instagram
// copy. The draft must pass the brand-voice guard before it reaches the T2
// publish gate; that validation is deterministic and tested here.

import { checkVoiceDeterministic } from '../6-brand-voice-guardian/handler';

export const BOT_ID = 'bot-3-content-drafting';

export interface DraftValidation {
  ok: boolean;
  issues: string[];
}

/**
 * Pure: validate a drafted post against the deterministic voice rules (no emoji,
 * no banned hype, Australian English). A draft that fails here never reaches the
 * publish gate.
 */
export function validateContentDraft(text: string): DraftValidation {
  const flags = checkVoiceDeterministic(text);
  const issues: string[] = [];
  if (flags.emoji) issues.push('contains emoji');
  if (flags.bannedPhrases.length) issues.push(`banned phrasing: ${flags.bannedPhrases.join(', ')}`);
  for (const a of flags.americanisms) issues.push(a);
  // Emoji and banned phrasing are hard fails; Americanisms are advisory.
  const ok = !flags.emoji && flags.bannedPhrases.length === 0;
  return { ok, issues };
}
