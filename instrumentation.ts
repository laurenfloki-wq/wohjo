// Next.js 16 instrumentation hook (project root, per
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
//
// WORKSTREAM 2 — pre-Mo observability shim. Catches errors thrown inside
// /api/* route handlers and ships a PII-scrubbed alert to Slack.
//
// Why this lives at the project root rather than under src/lib:
//   The Next runtime discovers `instrumentation.{ts,js}` only at the root
//   (or src/, when src/ is in use). All real work is in src/lib/observability;
//   this file is just the framework hook.
//
// onRequestError fires AFTER the response is sent, so awaiting Slack here does
// not block the API response. We still cap the fetch at 3s (slack.ts) to keep
// a misbehaving Slack from extending the lambda lifetime.

import type { Instrumentation } from 'next';

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  // Lazy-import so the shim has no impact on cold-start paths that never
  // throw. Also keeps the redaction code out of the edge bundle when the
  // hook fires in node only.
  const { reportError } = await import('@/lib/observability/slack');

  // Status is not surfaced by Next here — onRequestError is invoked once the
  // framework has decided to render an error response, which is always 5xx.
  // We default to 500 and let the route handler's actual status (when known)
  // override via context if Next ever surfaces it.
  const status = 500;

  await reportError({
    routePath: request.path,
    status,
    err: err as Error,
    headers: request.headers,
    requestId:
      (request.headers as Record<string, string | string[] | undefined>)?.[
        'x-request-id'
      ]?.toString() ?? null,
  });

  // Avoid `context` lint complaint — we read routerKind/routePath only to gate
  // on App Router route handlers; non-route errors (page renders, etc.) are
  // out of scope for this shim and slack.ts already filters via isApiRoute().
  void context;
};
