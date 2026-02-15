import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from '../../env';

/**
 * Tests for CORS origin validation.
 *
 * The app only allows specific origins:
 * - In dev mode: localhost:5173, 127.0.0.1:5173, localhost:4321, 127.0.0.1:4321
 * - Always: STOREFRONT_BASE_URL if configured
 * - Production: Only STOREFRONT_BASE_URL (no localhost)
 */

const getAllowedOrigins = (env: { DEV_MODE?: string; STOREFRONT_BASE_URL?: string }): string[] => {
  const origins: string[] = [];

  if (env.DEV_MODE === 'true') {
    origins.push(
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:4321',
      'http://127.0.0.1:4321'
    );
  }

  if (env.STOREFRONT_BASE_URL) {
    origins.push(env.STOREFRONT_BASE_URL);
  }

  return origins;
};

const createApp = (envOverrides: Partial<Env['Bindings']> = {}) => {
  const env = {
    DEV_MODE: 'false',
    STOREFRONT_BASE_URL: 'https://shop.example.com',
    ...envOverrides,
  };

  const app = new Hono<Env>();

  app.use(
    '*',
    cors({
      origin: (origin) => {
        const allowed = getAllowedOrigins(env);
        return origin && allowed.includes(origin) ? origin : undefined;
      },
      allowHeaders: ['Content-Type', 'x-admin-key', 'x-csrf-token', 'Authorization'],
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      maxAge: 86400,
    })
  );

  app.get('/test', (c) => c.json({ ok: true }));
  app.post('/test', (c) => c.json({ ok: true }));

  return app;
};

describe('CORS origin validation', () => {
  describe('production mode', () => {
    it('allows configured storefront origin', async () => {
      const app = createApp();
      const res = await app.request('/test', {
        headers: { Origin: 'https://shop.example.com' },
      });
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://shop.example.com');
    });

    it('rejects localhost origins in production', async () => {
      const app = createApp();
      const res = await app.request('/test', {
        headers: { Origin: 'http://localhost:4321' },
      });
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('rejects unknown origins', async () => {
      const app = createApp();
      const res = await app.request('/test', {
        headers: { Origin: 'https://evil.example.com' },
      });
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('rejects null origin', async () => {
      const app = createApp();
      const res = await app.request('/test', {
        headers: { Origin: 'null' },
      });
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('does not use wildcard origin', async () => {
      const app = createApp();
      const res = await app.request('/test', {
        headers: { Origin: 'https://shop.example.com' },
      });
      // Must be specific origin, never '*'
      expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
    });
  });

  describe('development mode', () => {
    const devApp = () => createApp({ DEV_MODE: 'true' });

    it('allows localhost:4321 in dev mode', async () => {
      const app = devApp();
      const res = await app.request('/test', {
        headers: { Origin: 'http://localhost:4321' },
      });
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:4321');
    });

    it('allows 127.0.0.1:4321 in dev mode', async () => {
      const app = devApp();
      const res = await app.request('/test', {
        headers: { Origin: 'http://127.0.0.1:4321' },
      });
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://127.0.0.1:4321');
    });

    it('allows localhost:5173 in dev mode', async () => {
      const app = devApp();
      const res = await app.request('/test', {
        headers: { Origin: 'http://localhost:5173' },
      });
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    });

    it('still rejects unknown origins in dev mode', async () => {
      const app = devApp();
      const res = await app.request('/test', {
        headers: { Origin: 'https://evil.example.com' },
      });
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
  });

  describe('CORS preflight', () => {
    it('returns allowed methods in preflight response', async () => {
      const app = createApp();
      const res = await app.request('/test', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://shop.example.com',
          'Access-Control-Request-Method': 'POST',
        },
      });
      const allowMethods = res.headers.get('Access-Control-Allow-Methods');
      expect(allowMethods).toContain('GET');
      expect(allowMethods).toContain('POST');
      expect(allowMethods).toContain('PUT');
      expect(allowMethods).toContain('DELETE');
    });

    it('returns allowed headers in preflight response', async () => {
      const app = createApp();
      const res = await app.request('/test', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://shop.example.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'x-admin-key',
        },
      });
      const allowHeaders = res.headers.get('Access-Control-Allow-Headers');
      expect(allowHeaders).toContain('x-admin-key');
      expect(allowHeaders).toContain('x-csrf-token');
      expect(allowHeaders).toContain('Authorization');
    });

    it('sets max-age for preflight caching', async () => {
      const app = createApp();
      const res = await app.request('/test', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://shop.example.com',
          'Access-Control-Request-Method': 'POST',
        },
      });
      expect(res.headers.get('Access-Control-Max-Age')).toBe('86400');
    });
  });

  describe('origin validation edge cases', () => {
    it('rejects origin with path appended', async () => {
      const app = createApp();
      const res = await app.request('/test', {
        headers: { Origin: 'https://shop.example.com/evil' },
      });
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('rejects origin with different port', async () => {
      const app = createApp();
      const res = await app.request('/test', {
        headers: { Origin: 'https://shop.example.com:8080' },
      });
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('rejects origin with different protocol', async () => {
      const app = createApp();
      const res = await app.request('/test', {
        headers: { Origin: 'http://shop.example.com' },
      });
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('rejects subdomain of allowed origin', async () => {
      const app = createApp();
      const res = await app.request('/test', {
        headers: { Origin: 'https://evil.shop.example.com' },
      });
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('handles missing STOREFRONT_BASE_URL', async () => {
      const app = createApp({ STOREFRONT_BASE_URL: undefined });
      const res = await app.request('/test', {
        headers: { Origin: 'https://any.example.com' },
      });
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
  });
});
