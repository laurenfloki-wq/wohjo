// Typed environment access for the bot fleet.
//
// Never throws at import time: a missing secret must not crash a serverless
// cold start (per OPERATING MANDATE rule 5 — never block on a missing secret).
// Call `requireEnv` only at the point of use, inside the gated path, so the
// code is complete and typecheck-clean using placeholders.

/** Read an optional env var. Works in Node and Deno. */
export function env(name: string): string | undefined {
  // Deno exposes Deno.env; Node exposes process.env. Guard both.
  const g = globalThis as unknown as {
    Deno?: { env: { get(k: string): string | undefined } };
    process?: { env: Record<string, string | undefined> };
  };
  if (g.Deno?.env) return g.Deno.env.get(name);
  if (g.process?.env) return g.process.env[name];
  return undefined;
}

/**
 * Read a required env var at the point of use. Throws a clear, secret-free
 * error naming the variable so the missing-credential is obvious in logs
 * without leaking any value.
 */
export function requireEnv(name: string): string {
  const v = env(name);
  if (v === undefined || v === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

/** Read an env var with a default fallback. */
export function envOr(name: string, fallback: string): string {
  const v = env(name);
  return v === undefined || v === '' ? fallback : v;
}
