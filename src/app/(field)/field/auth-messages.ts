// Pure helpers for tailoring field sign-in error messages.
// Kept separate so they can be unit-tested without importing the React page.

/**
 * Returns the appropriate "no identity found" message based on the
 * ?redirect URL parameter the visitor arrived with.
 *
 * When redirect=/command/dashboard the visitor intended to reach the
 * admin Command panel, so tell them admin enrolment is missing.
 * In all other cases they intended the worker Field app.
 */
export function noIdentityErrorMessage(redirectParam: string | null): string {
  if (redirectParam === '/command/dashboard') {
    return 'Phone number not enrolled as admin. Contact your co-director.';
  }
  return 'Phone number not enrolled as worker. Contact your supervisor.';
}
