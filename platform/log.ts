// Structured logging for the bot fleet.
//
// Mirrors the redaction posture of the product's src/lib/logger.ts but stands
// alone so the fleet never imports product internals. JSON to stdout; the
// managed runtime (Vercel / Supabase Edge) captures it. No console.* calls
// in business logic — route everything through here.

import pino, { type Logger } from 'pino';
import { env } from './env';

const level = env('LOG_LEVEL') ?? (env('NODE_ENV') === 'production' ? 'info' : 'debug');

export const log: Logger = pino({
  level,
  base: {
    app: 'flosmosis-fleet',
    env: env('VERCEL_ENV') ?? env('NODE_ENV') ?? 'development',
  },
  redact: {
    paths: [
      'headers.authorization',
      'headers.cookie',
      '*.ANTHROPIC_API_KEY',
      '*.SUPABASE_SERVICE_ROLE_KEY',
      '*.STRIPE_SECRET_KEY',
      '*.STRIPE_WEBHOOK_SECRET',
      '*.TWILIO_AUTH_TOKEN',
      '*.RESEND_API_KEY',
      '*.XERO_CLIENT_SECRET',
      '*.HUBSPOT_PRIVATE_APP_TOKEN',
      '*.GITHUB_FLEET_TOKEN',
      '*.DATABASE_URL',
      'body.token',
      'body.password',
      'body.apiKey',
    ],
    remove: true,
  },
  formatters: { level: (label) => ({ level: label }) },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/** Child logger scoped to a bot. */
export function botLogger(botId: string): Logger {
  return log.child({ botId });
}
