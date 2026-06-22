// Bot 6 — Brand-voice guardian.
//
// Trigger: inline | Runtime: in-process library | Gate: T0 | Model: Haiku.
//
// Deterministic emoji block (always) plus optional LLM voice scoring. The
// deterministic checks are the hard gate; the LLM score is advisory and only
// runs when explicitly enabled (cost control + offline-testable evals).

import { z } from 'zod';
import { containsEmoji } from '../../platform/guard';
import { completeJson } from '../../platform/llm';

export const BOT_ID = 'bot-6-brand-voice-guardian';

// Australian English + voice rules. Deterministic, cheap, no LLM.
const AMERICANISMS: ReadonlyArray<[RegExp, string]> = [
  [/\borganiz(e|ed|ing|ation)\b/gi, 'use Australian spelling (organise)'],
  [/\bcolor\b/gi, 'use Australian spelling (colour)'],
  [/\bcenter\b/gi, 'use Australian spelling (centre)'],
  [/\blicense\b/gi, 'use Australian spelling (licence, noun)'],
  [/\bcheck\b(?=\s)/gi, 'consider "cheque" where a payment is meant'],
];

// Hype/banned phrasing that is off-voice for a forensic, evidentiary product.
const BANNED_PHRASES: ReadonlyArray<RegExp> = [
  /\bgame[- ]?changer\b/gi,
  /\brevolutionary\b/gi,
  /\bsynergy\b/gi,
  /\bworld[- ]?class\b/gi,
];

export interface VoiceFlags {
  emoji: boolean;
  americanisms: string[];
  bannedPhrases: string[];
}

export interface VoiceScore {
  pass: boolean;
  flags: VoiceFlags;
  /** 0-100 voice alignment from the LLM, when scored. */
  llmScore: number | null;
  llmNotes: string | null;
}

/** Deterministic-only check. Always available, no network, used by evals. */
export function checkVoiceDeterministic(text: string): VoiceFlags {
  const americanisms = AMERICANISMS.filter(([re]) => re.test(text)).map(([, msg]) => msg);
  const bannedPhrases = BANNED_PHRASES.filter((re) => re.test(text)).map((re) => re.source);
  return { emoji: containsEmoji(text), americanisms, bannedPhrases };
}

const LlmVoiceSchema = z.object({
  score: z.number().min(0).max(100),
  notes: z.string(),
});

/**
 * Full score. Deterministic flags are the hard gate (pass=false on any emoji or
 * banned phrase). The LLM voice score runs only when `useLlm` is true.
 */
export async function scoreDraft(
  text: string,
  opts: { useLlm?: boolean } = {},
): Promise<VoiceScore> {
  const flags = checkVoiceDeterministic(text);
  const hardFail = flags.emoji || flags.bannedPhrases.length > 0;

  let llmScore: number | null = null;
  let llmNotes: string | null = null;
  if (opts.useLlm) {
    const { value } = await completeJson(
      {
        botId: BOT_ID,
        task: 'classify',
        system:
          'You score marketing copy for FLOSMOSIS, an Australian forensic workforce ' +
          'time-verification company. Voice: precise, evidentiary, plain Australian English, ' +
          'no hype, no emoji. Return JSON {score:0-100, notes:string}.',
        messages: [{ role: 'user', content: text }],
        maxTokens: 256,
      },
      LlmVoiceSchema,
    );
    llmScore = value.score;
    llmNotes = value.notes;
  }

  return { pass: !hardFail, flags, llmScore, llmNotes };
}
