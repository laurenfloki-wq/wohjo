// Flostruction — Security Utilities Tests
// Tests rate limiting, input sanitization, and validation bounds.
// Non-negotiable: 100% coverage on security functions.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  checkRateLimit,
  getClientIP,
  RATE_LIMITS,
} from './rate-limit';
import {
  sanitizeCSVValue,
  validateTotalHours,
  validatePayRate,
  HOURS_BOUNDS,
  PAY_RATE_BOUNDS,
} from './sanitize';

// ============================================================================
// RATE LIMITER TESTS
// ============================================================================

describe('Rate Limiter', () => {
  describe('checkRateLimit', () => {
    beforeEach(() => {
      // Clear the internal store before each test by triggering cleanup
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('first request within limit returns allowed: true', () => {
      const result = checkRateLimit('test-key', { windowMs: 1000, maxRequests: 5 });
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('requests at the limit return allowed: true with remaining: 0', () => {
      const key = 'limit-key';
      const options = { windowMs: 1000, maxRequests: 3 };

      // Make 3 requests to hit the limit
      const req1 = checkRateLimit(key, options);
      expect(req1.allowed).toBe(true);
      expect(req1.remaining).toBe(2);

      const req2 = checkRateLimit(key, options);
      expect(req2.allowed).toBe(true);
      expect(req2.remaining).toBe(1);

      const req3 = checkRateLimit(key, options);
      expect(req3.allowed).toBe(true);
      expect(req3.remaining).toBe(0);
    });

    it('requests over limit return allowed: false', () => {
      const key = 'over-limit-key';
      const options = { windowMs: 1000, maxRequests: 2 };

      // Use up the limit
      checkRateLimit(key, options);
      checkRateLimit(key, options);

      // Next request should be denied
      const result = checkRateLimit(key, options);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('different keys have separate limits', () => {
      const options = { windowMs: 1000, maxRequests: 2 };

      // Key A: 2 requests
      checkRateLimit('key-a', options);
      checkRateLimit('key-a', options);
      const resultA = checkRateLimit('key-a', options);
      expect(resultA.allowed).toBe(false);

      // Key B should still be allowed
      const resultB = checkRateLimit('key-b', options);
      expect(resultB.allowed).toBe(true);
      expect(resultB.remaining).toBe(1);
    });

    it('after window expires, requests are allowed again', async () => {
      const key = 'expiring-key';
      const options = { windowMs: 100, maxRequests: 2 };

      // Use up the limit
      checkRateLimit(key, options);
      checkRateLimit(key, options);

      const blockedResult = checkRateLimit(key, options);
      expect(blockedResult.allowed).toBe(false);

      // Wait for window to expire
      vi.advanceTimersByTime(150);

      // Request should be allowed in new window
      const allowedResult = checkRateLimit(key, options);
      expect(allowedResult.allowed).toBe(true);
      expect(allowedResult.remaining).toBe(1);
    });

    it('returns resetAt timestamp', () => {
      const key = 'resetAt-key';
      const options = { windowMs: 1000, maxRequests: 5 };
      const before = Date.now();

      const result = checkRateLimit(key, options);

      const after = Date.now();
      expect(result.resetAt).toBeGreaterThanOrEqual(before + options.windowMs);
      expect(result.resetAt).toBeLessThanOrEqual(after + options.windowMs);
    });

    it('resetAt is consistent within same window', () => {
      const key = 'consistent-reset-key';
      const options = { windowMs: 1000, maxRequests: 5 };

      const result1 = checkRateLimit(key, options);
      const result2 = checkRateLimit(key, options);

      expect(result2.resetAt).toBe(result1.resetAt);
    });
  });

  describe('getClientIP', () => {
    it('prefers X-Forwarded-For header', () => {
      const request = new Request('http://localhost', {
        headers: {
          'x-forwarded-for': '192.168.1.100, 10.0.0.1',
        },
      });

      const ip = getClientIP(request);
      expect(ip).toBe('192.168.1.100');
    });

    it('extracts first IP from comma-separated X-Forwarded-For', () => {
      const request = new Request('http://localhost', {
        headers: {
          'x-forwarded-for': '203.0.113.50, 198.51.100.1, 192.0.2.1',
        },
      });

      const ip = getClientIP(request);
      expect(ip).toBe('203.0.113.50');
    });

    it('trims whitespace from X-Forwarded-For', () => {
      const request = new Request('http://localhost', {
        headers: {
          'x-forwarded-for': '  203.0.113.50  , 198.51.100.1',
        },
      });

      const ip = getClientIP(request);
      expect(ip).toBe('203.0.113.50');
    });

    it('falls back to X-Real-IP when X-Forwarded-For absent', () => {
      const request = new Request('http://localhost', {
        headers: {
          'x-real-ip': '192.168.1.1',
        },
      });

      const ip = getClientIP(request);
      expect(ip).toBe('192.168.1.1');
    });

    it('returns "unknown" when no IP headers present', () => {
      const request = new Request('http://localhost', {
        headers: {},
      });

      const ip = getClientIP(request);
      expect(ip).toBe('unknown');
    });

    it('prefers X-Forwarded-For over X-Real-IP', () => {
      const request = new Request('http://localhost', {
        headers: {
          'x-forwarded-for': '203.0.113.50',
          'x-real-ip': '192.168.1.1',
        },
      });

      const ip = getClientIP(request);
      expect(ip).toBe('203.0.113.50');
    });
  });

  describe('RATE_LIMITS preset configurations', () => {
    it('AUTH configuration is correct', () => {
      expect(RATE_LIMITS.AUTH).toEqual({ windowMs: 60_000, maxRequests: 5 });
    });

    it('WEBHOOK configuration is correct', () => {
      expect(RATE_LIMITS.WEBHOOK).toEqual({ windowMs: 60_000, maxRequests: 30 });
    });

    it('API configuration is correct', () => {
      expect(RATE_LIMITS.API).toEqual({ windowMs: 60_000, maxRequests: 60 });
    });

    it('EXPORT configuration is correct', () => {
      expect(RATE_LIMITS.EXPORT).toEqual({ windowMs: 60_000, maxRequests: 5 });
    });

    it('all presets use 60-second window', () => {
      expect(RATE_LIMITS.AUTH.windowMs).toBe(60_000);
      expect(RATE_LIMITS.WEBHOOK.windowMs).toBe(60_000);
      expect(RATE_LIMITS.API.windowMs).toBe(60_000);
      expect(RATE_LIMITS.EXPORT.windowMs).toBe(60_000);
    });
  });
});

// ============================================================================
// SANITIZATION TESTS
// ============================================================================

describe('sanitizeCSVValue', () => {
  describe('formula injection prevention', () => {
    it('normal string returns unchanged', () => {
      const input = 'Normal Worker Name';
      const output = sanitizeCSVValue(input);
      expect(output).toBe('Normal Worker Name');
    });

    it('string starting with = gets prefixed with quote', () => {
      const input = '=CMD()';
      const output = sanitizeCSVValue(input);
      expect(output).toBe("'=CMD()");
    });

    it('string starting with + gets prefixed with quote', () => {
      const input = '+1234567890';
      const output = sanitizeCSVValue(input);
      expect(output).toBe("'+1234567890");
    });

    it('string starting with - gets prefixed with quote', () => {
      const input = '-2024';
      const output = sanitizeCSVValue(input);
      expect(output).toBe("'-2024");
    });

    it('string starting with @ gets prefixed with quote', () => {
      const input = '@example.com';
      const output = sanitizeCSVValue(input);
      expect(output).toBe("'@example.com");
    });

    it('string starting with tab gets prefixed with quote', () => {
      const input = '\tSuspicious';
      const output = sanitizeCSVValue(input);
      expect(output).toBe("'\tSuspicious");
    });

    it('string starting with carriage return gets prefixed with quote', () => {
      const input = '\rInjection';
      const output = sanitizeCSVValue(input);
      expect(output).toBe("'\rInjection");
    });

    it('empty string returns empty', () => {
      const input = '';
      const output = sanitizeCSVValue(input);
      expect(output).toBe('');
    });

    it('=CMD() payload is escaped', () => {
      const input = "=CMD()|'/C calc'!A0";
      const output = sanitizeCSVValue(input);
      expect(output).toBe("'=CMD()|'/C calc'!A0");
    });

    it('complex formula payload is escaped', () => {
      const input = "=cmd|'/C calc'!A0";
      const output = sanitizeCSVValue(input);
      expect(output).toBe("'=cmd|'/C calc'!A0");
    });

    it('string with = in middle but not at start returns unchanged', () => {
      const input = 'Value=100';
      const output = sanitizeCSVValue(input);
      expect(output).toBe('Value=100');
    });

    it('string with + in middle but not at start returns unchanged', () => {
      const input = 'A+B';
      const output = sanitizeCSVValue(input);
      expect(output).toBe('A+B');
    });

    it('whitespace prefix does not trigger sanitization', () => {
      const input = ' =CMD()';
      const output = sanitizeCSVValue(input);
      expect(output).toBe(' =CMD()');
    });

    it('numeric string starting with + is escaped', () => {
      const input = '+123456';
      const output = sanitizeCSVValue(input);
      expect(output).toBe("'+123456");
    });

    it('negative number is escaped', () => {
      const input = '-500';
      const output = sanitizeCSVValue(input);
      expect(output).toBe("'-500");
    });
  });
});

// ============================================================================
// VALIDATION TESTS
// ============================================================================

describe('validateTotalHours', () => {
  describe('valid hours', () => {
    it('8 hours (Joao test case) is valid', () => {
      const result = validateTotalHours(8);
      expect(result.valid).toBe(true);
      expect(result.clamped).toBe(8);
      expect(result.error).toBeUndefined();
    });

    it('0 hours (min bound) is valid', () => {
      const result = validateTotalHours(0);
      expect(result.valid).toBe(true);
      expect(result.clamped).toBe(0);
    });

    it('24 hours (max bound) is valid', () => {
      const result = validateTotalHours(24);
      expect(result.valid).toBe(true);
      expect(result.clamped).toBe(24);
    });

    it('decimal hours like 7.5 is valid', () => {
      const result = validateTotalHours(7.5);
      expect(result.valid).toBe(true);
      expect(result.clamped).toBe(7.5);
    });

    it('very small positive hours like 0.1 is valid', () => {
      const result = validateTotalHours(0.1);
      expect(result.valid).toBe(true);
      expect(result.clamped).toBe(0.1);
    });
  });

  describe('invalid hours', () => {
    it('negative hours returns invalid with error mentioning negative', () => {
      const result = validateTotalHours(-1);
      expect(result.valid).toBe(false);
      expect(result.clamped).toBe(0);
      expect(result.error).toBeDefined();
      expect(result.error?.toLowerCase()).toContain('negative');
    });

    it('hours exceeding 24 returns invalid with error mentioning exceed', () => {
      const result = validateTotalHours(25);
      expect(result.valid).toBe(false);
      expect(result.clamped).toBe(24);
      expect(result.error).toBeDefined();
      expect(result.error?.toLowerCase()).toContain('exceed');
    });

    it('very large hours like 999999 returns invalid with exceed message', () => {
      const result = validateTotalHours(999999);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.toLowerCase()).toContain('exceed');
    });

    it('NaN returns invalid', () => {
      const result = validateTotalHours(NaN);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('non-number type (simulated via NaN check) is invalid', () => {
      // Note: TypeScript prevents non-number from being passed,
      // but the runtime check still validates isNaN
      const result = validateTotalHours(Number('invalid'));
      expect(result.valid).toBe(false);
    });
  });

  describe('bounds constants', () => {
    it('HOURS_BOUNDS.MIN is 0', () => {
      expect(HOURS_BOUNDS.MIN).toBe(0);
    });

    it('HOURS_BOUNDS.MAX is 24', () => {
      expect(HOURS_BOUNDS.MAX).toBe(24);
    });
  });

  describe('edge cases', () => {
    it('hours at lower boundary + 0.001 is valid', () => {
      const result = validateTotalHours(0.001);
      expect(result.valid).toBe(true);
    });

    it('hours at upper boundary - 0.001 is valid', () => {
      const result = validateTotalHours(23.999);
      expect(result.valid).toBe(true);
    });

    it('hours at upper boundary + 0.001 is invalid', () => {
      const result = validateTotalHours(24.001);
      expect(result.valid).toBe(false);
      expect(result.error?.toLowerCase()).toContain('exceed');
    });
  });
});

describe('validatePayRate', () => {
  describe('valid pay rates', () => {
    it('28.47 (Joao test rate) is valid', () => {
      const result = validatePayRate(28.47);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('0.01 (min bound) is valid', () => {
      const result = validatePayRate(0.01);
      expect(result.valid).toBe(true);
    });

    it('500.00 (max bound) is valid', () => {
      const result = validatePayRate(500.00);
      expect(result.valid).toBe(true);
    });

    it('100.50 (mid-range) is valid', () => {
      const result = validatePayRate(100.50);
      expect(result.valid).toBe(true);
    });

    it('50 (round number) is valid', () => {
      const result = validatePayRate(50);
      expect(result.valid).toBe(true);
    });
  });

  describe('invalid pay rates', () => {
    it('0 (zero) returns invalid', () => {
      const result = validatePayRate(0);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('negative pay rate returns invalid', () => {
      const result = validatePayRate(-50);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('pay rate exceeding 500 returns invalid', () => {
      const result = validatePayRate(501);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('500.01 (just over max) returns invalid', () => {
      const result = validatePayRate(500.01);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('NaN returns invalid', () => {
      const result = validatePayRate(NaN);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('non-number type (simulated via NaN) is invalid', () => {
      const result = validatePayRate(Number('not-a-number'));
      expect(result.valid).toBe(false);
    });
  });

  describe('bounds constants', () => {
    it('PAY_RATE_BOUNDS.MIN is 0.01', () => {
      expect(PAY_RATE_BOUNDS.MIN).toBe(0.01);
    });

    it('PAY_RATE_BOUNDS.MAX is 500', () => {
      expect(PAY_RATE_BOUNDS.MAX).toBe(500);
    });
  });

  describe('edge cases', () => {
    it('pay rate at lower boundary + 0.001 is valid', () => {
      const result = validatePayRate(0.011);
      expect(result.valid).toBe(true);
    });

    it('pay rate at lower boundary - 0.001 is invalid', () => {
      const result = validatePayRate(0.009);
      expect(result.valid).toBe(false);
    });

    it('pay rate at upper boundary - 0.001 is valid', () => {
      const result = validatePayRate(499.99);
      expect(result.valid).toBe(true);
    });

    it('pay rate at upper boundary + 0.001 is invalid', () => {
      const result = validatePayRate(500.001);
      expect(result.valid).toBe(false);
    });

    it('very large negative number is invalid', () => {
      const result = validatePayRate(-999999);
      expect(result.valid).toBe(false);
    });

    it('very large positive number is invalid', () => {
      const result = validatePayRate(999999);
      expect(result.valid).toBe(false);
    });
  });

  describe('error messages', () => {
    it('error message for rate below minimum mentions minimum', () => {
      const result = validatePayRate(0);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('0.01');
    });

    it('error message for rate above maximum mentions maximum', () => {
      const result = validatePayRate(501);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('500');
    });

    it('error message includes actual value provided', () => {
      const result = validatePayRate(-50);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('-50');
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Security utilities integration', () => {
  it('Joao test scenario: 8 hours at $28.47/hr validates correctly', () => {
    const hoursResult = validateTotalHours(8);
    const rateResult = validatePayRate(28.47);

    expect(hoursResult.valid).toBe(true);
    expect(rateResult.valid).toBe(true);
  });

  it('CSV sanitization works with valid payroll data', () => {
    const workerName = 'João Silva';
    const sanitized = sanitizeCSVValue(workerName);
    expect(sanitized).toBe('João Silva');
  });

  it('sanitization blocks formula injection in worker data', () => {
    const maliciousName = '=WEBSERVICE("http://evil.com")';
    const sanitized = sanitizeCSVValue(maliciousName);
    expect(sanitized.startsWith("'")).toBe(true);
  });

  it('rate limiting can protect auth endpoint from brute force', () => {
    const ipAddr = '192.168.1.1';
    const key = `auth:${ipAddr}`;

    // Attempt 5 requests (the AUTH limit)
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit(key, RATE_LIMITS.AUTH);
      expect(result.allowed).toBe(true);
    }

    // 6th request should be blocked
    const blocked = checkRateLimit(key, RATE_LIMITS.AUTH);
    expect(blocked.allowed).toBe(false);
  });

  it('rate limiting with IP extraction works end-to-end', () => {
    const request = new Request('http://localhost', {
      headers: {
        'x-forwarded-for': '203.0.113.50',
      },
    });

    const ip = getClientIP(request);
    const key = `api:${ip}`;

    // Should allow API request
    const result = checkRateLimit(key, RATE_LIMITS.API);
    expect(result.allowed).toBe(true);
  });
});
