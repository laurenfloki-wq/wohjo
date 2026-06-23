// Golden evals — bot 6 (brand-voice guardian). Deterministic path only.

import { describe, it, expect } from 'vitest';
import { checkVoiceDeterministic, scoreDraft } from './handler';

describe('bot 6 — brand-voice guardian', () => {
  it('passes clean Australian-English copy', async () => {
    const text = 'FLOSTRUCTION seals each clock-on as evidence. We organise the record for you.';
    const flags = checkVoiceDeterministic(text);
    expect(flags.emoji).toBe(false);
    expect(flags.bannedPhrases).toHaveLength(0);
    const score = await scoreDraft(text);
    expect(score.pass).toBe(true);
    expect(score.llmScore).toBeNull(); // LLM off by default (cost control)
  });

  it('flags emoji as a hard fail', async () => {
    const score = await scoreDraft('Clock on now 🚀');
    expect(score.flags.emoji).toBe(true);
    expect(score.pass).toBe(false);
  });

  it('flags banned hype phrasing', async () => {
    const score = await scoreDraft('A revolutionary game-changer for payroll.');
    expect(score.flags.bannedPhrases.length).toBeGreaterThan(0);
    expect(score.pass).toBe(false);
  });

  it('flags Americanised spelling', () => {
    const flags = checkVoiceDeterministic('We will organize the color of the center.');
    expect(flags.americanisms.length).toBeGreaterThanOrEqual(3);
  });
});
