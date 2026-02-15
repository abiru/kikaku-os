/**
 * CSRF protection middleware for Cloudflare Workers.
 *
 * Uses double-submit cookie pattern for CSRF protection.
 * Server generates random token, stores in HttpOnly cookie,
 * and validates against x-csrf-token header on state-changing requests.
 *
 * Exempt endpoints:
 * - Webhook endpoints (verified via Stripe signature)
 * - Endpoints authenticated with x-admin-key (admin API)
 * - OPTIONS preflight requests
 */

import type { Context, Next } from 'hono';
import { setCookie, getCookie } from 'hono/cookie';
import type { Env } from '../env';

const CSRF_COOKIE_NAME = '__csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const EXEMPT_PATH_PREFIXES = [
  '/webhooks/stripe',
  '/stripe/webhook',
] as const;

/**
 * Generate a cryptographically random CSRF token.
 * Returns a base64url-encoded random string.
 */
export const generateCsrfToken = (): string => {
  const buffer = new Uint8Array(32);
  crypto.getRandomValues(buffer);
  // Convert to base64url (URL-safe base64)
  const base64 = btoa(String.fromCharCode(...buffer));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

/**
 * Validate CSRF token by comparing cookie value with header value.
 * Uses constant-time comparison to prevent timing attacks.
 */
export const validateCsrfToken = (cookieToken: string, headerToken: string): boolean => {
  if (!cookieToken || !headerToken) return false;
  if (cookieToken.length !== headerToken.length) return false;

  // Constant-time comparison
  let result = 0;
  for (let i = 0; i < cookieToken.length; i++) {
    result |= cookieToken.charCodeAt(i) ^ headerToken.charCodeAt(i);
  }
  return result === 0;
};

/**
 * Check if a request path is exempt from CSRF protection.
 */
const isExemptPath = (path: string): boolean =>
  EXEMPT_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));

/**
 * Check if a request uses admin API key authentication.
 */
const hasAdminApiKey = (c: Context<Env>): boolean => {
  const apiKey = c.req.header('x-admin-key');
  return typeof apiKey === 'string' && apiKey.length > 0;
};

/**
 * Get or create a CSRF token cookie for the current session.
 * Returns the token value.
 */
const ensureCsrfCookie = (c: Context<Env>): string => {
  let token = getCookie(c, CSRF_COOKIE_NAME);

  if (!token) {
    token = generateCsrfToken();
    setCookie(c, CSRF_COOKIE_NAME, token, {
      httpOnly: true,
      secure: c.req.url.startsWith('https://'),
      sameSite: 'Strict',
      path: '/',
      maxAge: 3600, // 1 hour
    });
  }

  return token;
};

/**
 * CSRF protection middleware using double-submit cookie pattern.
 *
 * For safe methods (GET, HEAD, OPTIONS):
 * - Ensures CSRF cookie is set
 * - Allows request to proceed
 *
 * For state-changing requests (POST, PUT, DELETE, PATCH):
 * - Exempt: webhook endpoints, admin API key requests
 * - Required: x-csrf-token header must match cookie value
 *
 * Clients should:
 * 1. Make any request to receive the CSRF cookie
 * 2. Include the cookie value in x-csrf-token header for mutations
 */
export const csrfProtection = () => {
  return async (c: Context<Env>, next: Next) => {
    // Webhook endpoints are exempt (use Stripe signature verification)
    if (isExemptPath(c.req.path)) {
      return next();
    }

    // Admin API key requests are exempt (API-to-API authentication)
    if (hasAdminApiKey(c)) {
      return next();
    }

    // Safe methods: ensure cookie is set but don't validate
    if (SAFE_METHODS.has(c.req.method)) {
      ensureCsrfCookie(c);
      return next();
    }

    // State-changing requests: validate token
    const cookieToken = getCookie(c, CSRF_COOKIE_NAME);
    const headerToken = c.req.header(CSRF_HEADER_NAME);

    if (!cookieToken || !headerToken) {
      return c.json(
        { ok: false, message: 'CSRF token required' },
        403
      );
    }

    if (!validateCsrfToken(cookieToken, headerToken)) {
      return c.json(
        { ok: false, message: 'Invalid CSRF token' },
        403
      );
    }

    return next();
  };
};
