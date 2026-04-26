// Structured logging via pino. Central module so every API route shares
// the same configuration (levels, redactors, serialisers).
//
// Design notes:
//   * Emits JSON to stdout. Vercel captures stdout into its log stream;
//     no transport config needed.
//   * Level defaults to 'info' in production and 'debug' in non-prod.
//   * Every log line carries app + env fields for filtering.
//   * `redact` protects against accidental secret leakage if someone
//     passes a request/env object through. Add more paths here as new
//     secret-carrying shapes emerge.
//   * No console.* calls anywhere in this module (CLAUDE.md #1).

import pino, { type Logger } from 'pino';

const level =
  process.env.LOG_LEVEL ??
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

export const logger: Logger = pino({
  level,
  base: {
    app: 'flostruction',
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
  },
  redact: {
    paths: [
      // Request / fetch shapes
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-cron-secret"]',
      'req.headers["x-twilio-signature"]',
      'headers.authorization',
      'headers.cookie',
      'headers["x-cron-secret"]',
      'headers["x-twilio-signature"]',
      // Common body shapes
      'body.password',
      'body.token',
      'body.otp',
      'body.apiKey',
      // Twilio webhook body
      'body.AuthToken',
      'body.AccountSid',
      // Env-ish keys
      '*.SUPABASE_SERVICE_ROLE_KEY',
      '*.RESEND_API_KEY',
      '*.TWILIO_AUTH_TOKEN',
      '*.STRIPE_SECRET_KEY',
      '*.CRON_SECRET',
      '*.JWT_SECRET',
      '*.DATABASE_URL',
    ],
    remove: true,
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Build a child logger scoped to an API route. Adds `route` and `method`
 * fields to every emitted record, plus a request id if provided.
 *
 * Callers typically do:
 *   const log = routeLogger('POST /api/field/shift/end', request.headers.get('x-request-id'));
 *   log.info({ workerId }, 'shift.end.received');
 */
export function routeLogger(route: string, requestId?: string | null): Logger {
  return logger.child({
    route,
    ...(requestId ? { requestId } : {}),
  });
}
