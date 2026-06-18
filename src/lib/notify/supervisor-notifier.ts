// Channel-agnostic supervisor notification.
//
// Today every supervisor batch goes out as an SMS. RCS (branded sender +
// inline buttons) isn't usable in Australia yet — carriers haven't enabled it
// — and WhatsApp needs opt-in + Meta templates, so SMS is the universal floor.
// This interface keeps the cron from knowing which channel it's using: when
// RCS/WhatsApp land, add a notifier and a selection rule, and the cron is
// unchanged. The magic-link approve page (src/components/verify) stays the
// source of truth regardless of channel.

export interface SupervisorNotification {
  /** E.164 phone (the supervisor's number). */
  to: string;
  /** Plain-text body — the universal fallback every channel can render. */
  body: string;
  /** Structured payload a richer channel can use instead of `body`
   *  (RCS card, WhatsApp buttons). Ignored by SMS. */
  rich?: {
    reviewUrl: string;
    shiftCount: number;
  };
}

export interface NotifyResult {
  channel: string;
  sid: string | null;
}

export interface SupervisorNotifier {
  readonly channel: string;
  send(n: SupervisorNotification): Promise<NotifyResult>;
}

interface TwilioLike {
  messages: { create(opts: { to: string; from: string; body: string }): Promise<{ sid?: string }> };
}

/** The universal SMS channel (Twilio). */
export class SmsNotifier implements SupervisorNotifier {
  readonly channel = 'twilio_sms';
  constructor(
    private readonly client: TwilioLike,
    private readonly from: string,
  ) {}

  async send(n: SupervisorNotification): Promise<NotifyResult> {
    const msg = await this.client.messages.create({ to: n.to, from: this.from, body: n.body });
    return { channel: this.channel, sid: msg.sid ?? null };
  }
}
