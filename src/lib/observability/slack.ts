// Observability shim — Slack notifier.
//
// Catches errors from /api/* route handlers via the Next.js `onRequestError`
// instrumentation hook (see /instrumentation.ts at project root) and posts a
// structured, PII-scrubbed payload to a Slack incoming webhook.
//
// What this module does NOT do:
//   - capture request bodies (Next does not give us them in onRequestError; if
//     it did we would refuse them)
//   - capture user identifiers, GPS, auth tokens
//   - retry on Slack failure (we silently degrade)
//
// Future-state: when Datadog AU goes GA, this shim is retired in favour of
// proper APM. See docs/observability-shim.md.

import { safeMessage } from './redact';
import { defaultThrottle, throttleKey } from './throttle';

const FETCH_TIMEOUT_MS = 3000;
const MAX_STACK_FRAMES = 1; // top frame only, then truncated

// One-shot startup notice: log once per function instance whether the shim is
// configured. Done lazily on first call so cold-start logs stay clean.
let startupLogged = false;
function logStartupOnce(enabled: boolean): void {
  if (startupLogged) return;
  startupLogged = true;
  if (!enabled) {
    // Use console.error rather than the pino logger to avoid pulling logger
    // dependencies into the instrumentation hook (which can run in edge).
    console.error('[observability-shim] SLACK_ERROR_WEBHOOK_URL not set — shim disabled (no-op)');
  }
}

export interface ErrorContext {
  routePath: string;       // e.g. /api/worker/shifts/start
  status?: number;         // HTTP status code, if known
  err: Error | { message: string; stack?: string };
  requestId?: string | null;
  // Headers from the inbound request, used to mine x-vercel-id. We accept
  // either a Headers instance or a plain dict so tests can pass plain objects.
  headers?: Headers | Record<string, string | string[] | undefined> | null;
}

interface SlackPayload {
  text: string;
  blocks: Array<{
    type: string;
    text?: { type: string; text: string };
    fields?: Array<{ type: string; text: string }>;
  }>;
}

// Format a Date as an AEST (Australia/Sydney) human-readable timestamp followed
// by the ISO-8601 source for unambiguous correlation in logs.
export function formatAest(now: Date = new Date()): string {
  const aest = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    dateStyle: 'short',
    timeStyle: 'medium',
    hour12: false,
  }).format(now);
  return `${aest} AEST (${now.toISOString()})`;
}

// Filter onRequestError to /api/* routes only. Static assets, _next, favicon,
// page render errors are out of scope for this shim.
export function isApiRoute(path: string | undefined | null): boolean {
  if (!path) return false;
  // Strip query string before matching.
  const p = path.split('?')[0];
  return p.startsWith('/api/');
}

function topStackFrame(stack: string | undefined): string {
  if (!stack) return '(no stack)';
  // First line of stack is usually the error message; we want the first frame
  // after that. Tolerate both V8 and ESBuild stack shapes.
  const lines = stack.split('\n').map((l) => l.trim()).filter(Boolean);
  const frames = lines.filter((l) => l.startsWith('at '));
  if (frames.length === 0) return safeMessage(lines[0] ?? '(no frame)');
  return safeMessage(frames.slice(0, MAX_STACK_FRAMES).join('\n'));
}

function readHeader(
  headers: ErrorContext['headers'],
  key: string,
): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(key) ?? undefined;
  }
  const dict = headers as Record<string, string | string[] | undefined>;
  const v = dict[key] ?? dict[key.toLowerCase()];
  if (Array.isArray(v)) return v[0];
  return v;
}

export function buildPayload(ctx: ErrorContext, now: Date = new Date()): SlackPayload {
  const message = safeMessage(ctx.err.message ?? '(no message)');
  const frame = topStackFrame(ctx.err.stack);
  const status = ctx.status ?? 500;
  const env =
    process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development';
  const deployment = process.env.VERCEL_URL ?? '(local)';
  const vercelId =
    readHeader(ctx.headers, 'x-vercel-id') ?? ctx.requestId ?? '(none)';

  return {
    text: `[${env}] ${status} on ${ctx.routePath} — ${message}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*API error captured* — \`${env}\``,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Route*\n\`${ctx.routePath}\`` },
          { type: 'mrkdwn', text: `*Status*\n${status}` },
          { type: 'mrkdwn', text: `*Time*\n${formatAest(now)}` },
          { type: 'mrkdwn', text: `*Request ID*\n\`${vercelId}\`` },
          { type: 'mrkdwn', text: `*Deployment*\n\`${deployment}\`` },
          { type: 'mrkdwn', text: `*Environment*\n${env}` },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Message*\n\`\`\`${message}\`\`\``,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Top frame*\n\`\`\`${frame}\`\`\``,
        },
      },
    ],
  };
}

// Public entry point. Caller must `await` this from the instrumentation hook
// (per Next.js 16 docs — onRequestError fires after the response is sent, so
// awaiting here does NOT block the API response).
export async function reportError(ctx: ErrorContext): Promise<void> {
  const webhook = process.env.SLACK_ERROR_WEBHOOK_URL;
  logStartupOnce(Boolean(webhook));

  if (!webhook) return;
  if (!isApiRoute(ctx.routePath)) return;

  const status = ctx.status ?? 500;
  if (!defaultThrottle.shouldFire(throttleKey(ctx.routePath, status))) {
    return;
  }

  const payload = buildPayload(ctx);

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    // Graceful failure: never crash production because Slack is unreachable.
    console.error('[observability-shim] slack post failed:', String(e));
  }
}

// ─── W5/SG-6 — operational RED alerts ────────────────────────────────
// Same data-path rules as reportError: PII-scrubbed, throttled, 3s cap,
// silent no-op without the webhook. Used by the FLOS-SHA-001 runner and
// verify-hashes when a check goes RED — the durable record (alert rows +
// substrate_health_log) is written FIRST by the callers; this is the
// best-effort human ping on top.
export async function postOpsAlert(title: string, lines: string[]): Promise<void> {
  const webhook = process.env.SLACK_ERROR_WEBHOOK_URL;
  logStartupOnce(Boolean(webhook));
  if (!webhook) return;
  if (!defaultThrottle.shouldFire(throttleKey(`ops:${title}`, 0))) {
    return;
  }
  const safeLines = lines.map((l) => safeMessage(l, 500));
  const payload = {
    text: `WOHJO ops alert — ${safeMessage(title, 150)}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `🔴 ${safeMessage(title, 140)}` },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${safeLines.join('\n')}\n_${formatAest()}_`,
        },
      },
    ],
  };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    // Graceful failure: never crash production because Slack is unreachable.
    console.error('[observability-shim] ops alert post failed:', String(e));
  }
}

// Test-only escape hatch: lets unit tests reset the startup-log flag and the
// throttle between cases.
export const __test = {
  resetStartupLog(): void {
    startupLogged = false;
  },
};
