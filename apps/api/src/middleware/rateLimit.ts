/**
 * Simple in-memory rate limiter for Cloudflare Workers.
 * Uses a sliding window counter per IP address.
 *
 * Note: This is per-isolate only. For distributed rate limiting,
 * use Cloudflare Rate Limiting Rules at the edge.
 */

import type { Context, Next } from 'hono';
import type { Env } from '../env';

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, RateLimitEntry>();

// Periodically clean expired entries to prevent memory leaks
const CLEANUP_INTERVAL = 60_000; // 1 minute
let lastCleanup = Date.now();

const cleanup = () => {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
};

type RateLimitOptions = {
  /** Maximum requests allowed in the window */
  max: number;
  /** Window size in seconds */
  windowSeconds: number;
  /** Key prefix to separate different limiters */
  prefix?: string;
};

/**
 * Creates a rate limiting middleware.
 *
 * @example
 * // 60 requests per minute
 * app.use('/api/*', rateLimit({ max: 60, windowSeconds: 60 }));
 *
 * // Stricter limit for payment endpoints
 * app.use('/payments/*', rateLimit({ max: 10, windowSeconds: 60, prefix: 'pay' }));
 */
export const rateLimit = (options: RateLimitOptions) => {
  const { max, windowSeconds, prefix = 'rl' } = options;
  const windowMs = windowSeconds * 1000;

  return async (c: Context<Env>, next: Next) => {
    // Do not throttle health checks or CORS preflight.
    if (c.req.method === 'OPTIONS' || c.req.path === '/health') {
      return next();
    }

    cleanup();

    // Use CF-Connecting-IP (Cloudflare) or fallback headers
    const ip =
      c.req.header('cf-connecting-ip') ||
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      'unknown';

    const key = `${prefix}:${ip}`;
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      // New window
      store.set(key, { count: 1, resetAt: now + windowMs });
      c.res.headers.set('X-RateLimit-Limit', String(max));
      c.res.headers.set('X-RateLimit-Remaining', String(max - 1));
      return next();
    }

    if (entry.count >= max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      const res = c.json(
        { ok: false, message: 'Too many requests' },
        429
      );
      res.headers.set('Retry-After', String(retryAfter));
      res.headers.set('X-RateLimit-Limit', String(max));
      res.headers.set('X-RateLimit-Remaining', '0');
      res.headers.set('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
      return res;
    }

    // Increment counter (immutable pattern)
    store.set(key, { ...entry, count: entry.count + 1 });
    c.res.headers.set('X-RateLimit-Limit', String(max));
    c.res.headers.set('X-RateLimit-Remaining', String(max - entry.count - 1));
    return next();
  };
};
