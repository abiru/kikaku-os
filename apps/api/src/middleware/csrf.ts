/**
 * CSRF protection middleware for Cloudflare Workers.
 *
 * Generates and validates CSRF tokens for state-changing requests
 * (POST, PUT, DELETE). Tokens are stored in-memory per-isolate.
 *
 * Exempt endpoints:
 * - Webhook endpoints (verified via Stripe signature)
 * - Endpoints authenticated with x-admin-key (admin API)
 * - OPTIONS preflight and GET/HEAD requests (safe methods)
 */

import type { Context, Next } from 'hono';
import type { Env } from '../env';

type CsrfTokenEntry = {
  readonly token: string;
  readonly expiresAt: number;
};

// In-memory token store (per-isolate on Cloudflare Workers)
const tokenStore = new Map<string, CsrfTokenEntry>();

const TOKEN_TTL_MS = 3_600_000; // 1 hour
const CLEANUP_INTERVAL_MS = 300_000; // 5 minutes
let lastCleanup = Date.now();

const cleanup = () => {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of tokenStore) {
    if (entry.expiresAt <= now) {
      tokenStore.delete(key);
    }
  }
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const EXEMPT_PATH_PREFIXES = [
  '/webhooks/stripe',
  '/stripe/webhook',
] as const;

/**
 * Generate a new CSRF token for a given session key.
 * Returns the token string to be sent to the client.
 */
export const generateCsrfToken = (sessionKey: string): string => {
  cleanup();
  const token = crypto.randomUUID();
  const now = Date.now();
  tokenStore.set(sessionKey, {
    token,
    expiresAt: now + TOKEN_TTL_MS,
  });
  return token;
};

/**
 * Validate a CSRF token against the stored value.
 * Consumes the token on successful validation (one-time use).
 */
export const validateCsrfToken = (sessionKey: string, token: string): boolean => {
  const entry = tokenStore.get(sessionKey);
  if (!entry) return false;
  if (entry.expiresAt <= Date.now()) {
    tokenStore.delete(sessionKey);
    return false;
  }
  if (entry.token !== token) return false;
  // Consume the token (one-time use)
  tokenStore.delete(sessionKey);
  return true;
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
 * Get a session key from the request (IP-based for stateless operation).
 */
const getSessionKey = (c: Context<Env>): string => {
  const ip =
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';
  return `csrf:${ip}`;
};

/**
 * CSRF protection middleware.
 *
 * For state-changing requests (POST, PUT, DELETE):
 * - Exempt: webhook endpoints, admin API key requests
 * - Required: x-csrf-token header must match stored token
 *
 * Clients should:
 * 1. GET /csrf-token to obtain a token
 * 2. Include the token in x-csrf-token header for subsequent mutations
 */
export const csrfProtection = () => {
  return async (c: Context<Env>, next: Next) => {
    // Safe methods don't need CSRF protection
    if (SAFE_METHODS.has(c.req.method)) {
      return next();
    }

    // Webhook endpoints are exempt (use Stripe signature verification)
    if (isExemptPath(c.req.path)) {
      return next();
    }

    // Admin API key requests are exempt (API-to-API authentication)
    if (hasAdminApiKey(c)) {
      return next();
    }

    // Validate CSRF token
    const token = c.req.header('x-csrf-token');
    if (!token) {
      return c.json(
        { ok: false, message: 'CSRF token required' },
        403
      );
    }

    const sessionKey = getSessionKey(c);
    if (!validateCsrfToken(sessionKey, token)) {
      return c.json(
        { ok: false, message: 'Invalid or expired CSRF token' },
        403
      );
    }

    return next();
  };
};

/** Clear the token store (for testing). */
export const _clearTokenStore = () => {
  tokenStore.clear();
};
