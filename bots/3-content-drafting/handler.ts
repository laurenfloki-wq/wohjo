// Bot 3 — Content drafting.
//
// Trigger: manual/calendar | Runtime: EF (HTTP) | Gate: T2 publish |
// Model: Sonnet. Pulls a brief + voice rules and drafts LinkedIn + Instagram
// copy. The draft must pass the brand-voice guard before it reaches the T2
// publish gate; that validation is deterministic and tested here.

import { checkVoiceDeterministic } from '../6-brand-voice-guardian/handler';
import { MESSAGE_PILLARS } from '../config';

export const BOT_ID = 'bot-3-content-drafting';

export interface DraftValidation {
  ok: boolean;
  /** Carries the differentiated narrative (at least one evidentiary pillar). */
  onMessage: boolean;
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

  // On-message: a FLOSMOSIS post should carry the differentiated narrative —
  // at least one evidentiary pillar (proof / wage-theft / Fair Work / sealed).
  const lower = text.toLowerCase();
  const onMessage = MESSAGE_PILLARS.some((p) => lower.includes(p));
  if (!onMessage)
    issues.push('off-message: no evidentiary value pillar (proof/wage-theft/compliance)');

  // Emoji and banned phrasing are hard fails; Americanisms + off-message are advisory.
  const ok = !flags.emoji && flags.bannedPhrases.length === 0;
  return { ok, onMessage, issues };
}
