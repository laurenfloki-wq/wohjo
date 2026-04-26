// Day 5 P1 — translate AuthorizationError thrown by auth helpers
// into a NextResponse. Used at the top of every Class-A and Class-B
// route so the helper can throw and the route stays declarative.

import { NextResponse } from 'next/server';
import { AuthorizationError, isAuthorizationError } from './errors';

export function authErrorResponse(err: unknown): NextResponse {
  if (isAuthorizationError(err)) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.status },
    );
  }
  // Unknown error — generic 500 so we don't leak internals.
  const message = err instanceof Error ? err.message : 'Unknown error';
  return NextResponse.json({ error: message }, { status: 500 });
}

export { AuthorizationError, isAuthorizationError };
