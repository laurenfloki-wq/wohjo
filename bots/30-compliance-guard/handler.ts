// Bot 30 — Compliance guard.
//
// Trigger: inline (before any send/data flow) | Runtime: in-process library
// Gate: T0 hard block | Model: none (deterministic, never an LLM).
//
// This bot is the deterministic enforcement point every other bot calls before
// an external send. It wraps platform/guard with audit logging so each block or
// pass leaves a ledger record (HARD CONSTRAINT 7). A non-compliant send becomes
// impossible: the guard throws and the caller must not catch-and-send.

import {
  assertSpamActCompliant,
  assertNoEmoji,
  GuardError,
  type OutboundEmail,
} from '../../platform/guard';
import { record } from '../../platform/audit';

export const BOT_ID = 'bot-30-compliance-guard';

export interface GuardOutcome {
  ok: boolean;
  code: string | null;
  message: string | null;
}

/**
 * Gate an outbound email. Returns ok on pass; on failure records the block and
 * re-throws so the send cannot proceed. Callers must let the throw propagate.
 */
export async function gateOutboundEmail(email: OutboundEmail): Promise<GuardOutcome> {
  try {
    assertSpamActCompliant(email);
    await record({
      botId: BOT_ID,
      action: 'compliance.email.pass',
      detail: { to: email.to, subject: email.subject },
    });
    return { ok: true, code: null, message: null };
  } catch (err) {
    if (err instanceof GuardError) {
      await record({
        botId: BOT_ID,
        action: 'compliance.email.block',
        detail: { to: email.to, subject: email.subject, code: err.code, reason: err.message },
      });
    }
    throw err;
  }
}

/** Gate arbitrary outbound text (e.g. SMS, social) for output hygiene. */
export async function gateOutboundText(text: string, context: string): Promise<GuardOutcome> {
  try {
    assertNoEmoji(text, context);
    return { ok: true, code: null, message: null };
  } catch (err) {
    if (err instanceof GuardError) {
      await record({
        botId: BOT_ID,
        action: 'compliance.text.block',
        detail: { context, code: err.code },
      });
    }
    throw err;
  }
}
