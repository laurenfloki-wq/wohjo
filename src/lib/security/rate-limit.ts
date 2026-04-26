// Flostruction — In-Memory Rate Limiter
// Simple sliding-window rate limiter for API routes.
// Non-negotiable: protect auth and webhook endpoints from abuse.

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
}, 60_000);

interface RateLimitOptions {
  windowMs: number;   // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check rate limit for a given key (e.g., IP address, phone number).
 * Returns whether the request is allowed and remaining quota.
 */
export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || existing.resetAt < now) {
    // New window
    store.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, remaining: options.maxRequests - 1, resetAt: now + options.windowMs };
  }

  if (existing.count >= options.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count++;
  return { allowed: true, remaining: options.maxRequests - existing.count, resetAt: existing.resetAt };
}

/**
 * Extract client IP from request headers.
 * Prefers X-Forwarded-For (Vercel), falls back to X-Real-IP.
 */
export function getClientIP(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const xri = request.headers.get('x-real-ip');
  if (xri) return xri;
  return 'unknown';
}

// Preset configurations
export const RATE_LIMITS = {
  /** Auth endpoints: 5 requests per 60 seconds per IP */
  AUTH: { windowMs: 60_000, maxRequests: 5 },
  /** Webhook endpoints: 30 requests per 60 seconds per IP */
  WEBHOOK: { windowMs: 60_000, maxRequests: 30 },
  /** API endpoints: 60 requests per 60 seconds per IP */
  API: { windowMs: 60_000, maxRequests: 60 },
  /** Export endpoints: 5 requests per 60 seconds per IP */
  EXPORT: { windowMs: 60_000, maxRequests: 5 },
} as const;
