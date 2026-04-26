// Day 5 P1 auth helpers — typed errors.
//
// Routes catch these and translate to NextResponse. Keeping the class-based
// error lets the helpers throw with rich context while the routes stay thin.

export class AuthorizationError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export function isAuthorizationError(err: unknown): err is AuthorizationError {
  return err instanceof AuthorizationError;
}
