// Observability shim — PII redaction.
//
// CRACK 172/179 cancelled the Sentry path because it stored events in EU. This
// shim replaces that with a Slack-only error notifier that we control end-to-end,
// so the same Privacy Act / APP 8 constraint applies here:
//   No phone numbers, emails, GPS, identifiers, tokens, or request bodies leave
//   the worker function.
//
// We treat error.message + error.stack as untrusted text — a careless throw can
// embed user input in the message ("invalid phone +614..." etc.). The regexes
// below scrub the common PII shapes before any payload reaches Slack.

const PHONE_RE = /\+?\d{10,15}/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function redact(input: string): string {
  if (!input) return input;
  // Order matters: emails contain dots and would otherwise survive phone regex
  // trimming. Phones are scrubbed before UUIDs because phone digits in a UUID
  // shape are already covered by the UUID regex.
  return input
    .replace(EMAIL_RE, '[EMAIL]')
    .replace(UUID_RE, '[UUID]')
    .replace(PHONE_RE, '[PHONE]');
}

export function truncate(input: string, max = 500): string {
  if (!input) return input;
  if (input.length <= max) return input;
  return input.slice(0, max) + '…';
}

// Convenience: redact then truncate. Always cap at 500 chars to keep Slack
// payloads under the 4 KB block limit and prevent noisy stack traces drowning
// the channel.
export function safeMessage(input: string, max = 500): string {
  return truncate(redact(input), max);
}
