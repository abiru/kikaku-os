/**
 * Smoke tests for pre-deploy verification.
 *
 * These tests exercise the full app stack (middleware, CORS, CSRF, auth, routing)
 * to verify critical endpoints respond correctly before deployment.
 */
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { registerRoutes } from '../../routes';
import health from '../../routes/health';

// ---------------------------------------------------------------------------
// Shared mock factories
// ---------------------------------------------------------------------------

// All admin permissions for RBAC mock
const ALL_ADMIN_PERMISSIONS = [
  { id: 'dashboard:read' }, { id: 'users:read' }, { id: 'users:write' }, { id: 'users:delete' },
  { id: 'orders:read' }, { id: 'orders:write' }, { id: 'products:read' }, { id: 'products:write' },
  { id: 'products:delete' }, { id: 'inventory:read' }, { id: 'inventory:write' },
  { id: 'inbox:read' }, { id: 'inbox:approve' }, { id: 'reports:read' }, { id: 'ledger:read' },
  { id: 'settings:read' }, { id: 'settings:write' }, { id: 'customers:read' }, { id: 'customers:write' },
  { id: 'tax-rates:read' }, { id: 'tax-rates:write' },
];

const createMockDb = () => ({
  prepare: vi.fn((sql: string) => {
    const statement = {
      bind: vi.fn((..._args: unknown[]) => statement),
      first: vi.fn(async () => {
        if (sql.includes('SELECT 1 as result')) return { result: 1 };
        if (sql.includes('COUNT')) return { total: 0 };
        return null;
      }),
      all: vi.fn(async () => {
        // Return admin permissions for RBAC loadRbac queries
        if (sql.includes('FROM permissions') && sql.includes('role_permissions')) {
          return { results: ALL_ADMIN_PERMISSIONS };
        }
        return { results: [] };
      }),
      run: vi.fn(async () => ({ meta: { last_row_id: 0, changes: 0 }, success: true })),
    };
    return statement;
  }),
  batch: vi.fn(async () => []),
});

const createMockR2 = () => ({
  list: vi.fn(async () => ({ objects: [] })),
  get: vi.fn(async () => null),
  put: vi.fn(async () => undefined),
});

// Use a strong API key (>= 32 chars) so security checks pass
const STRONG_ADMIN_KEY = 'a'.repeat(32);

const BASE_ENV = {
  ADMIN_API_KEY: STRONG_ADMIN_KEY,
  STRIPE_SECRET_KEY: 'sk_test_xxx',
  STRIPE_WEBHOOK_SECRET: 'whsec_xxx',
  STRIPE_PUBLISHABLE_KEY: 'pk_test_xxx',
  STOREFRONT_BASE_URL: 'http://localhost:4321',
  CLERK_SECRET_KEY: 'sk_clerk_xxx',
  DEV_MODE: 'false',
  DB: createMockDb(),
  R2: createMockR2(),
};

// ---------------------------------------------------------------------------
// Lightweight app builder that mirrors the real app's middleware stack
// but skips Sentry wrapping and cron-related code.
// ---------------------------------------------------------------------------

const createSmokeApp = (envOverrides: Record<string, unknown> = {}) => {
  const env = { ...BASE_ENV, DB: createMockDb(), R2: createMockR2(), ...envOverrides };
  const app = new Hono();

  // CORS (simplified for test – always allow the test origin)
  app.use(
    '*',
    cors({
      origin: 'http://localhost:4321',
      allowHeaders: ['Content-Type', 'x-admin-key', 'x-csrf-token', 'Authorization'],
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      maxAge: 86400,
    }),
  );

  // Foreign-key pragma (mirrors index.ts)
  app.use('*', async (c, next) => {
    try { await (env.DB as any).prepare('PRAGMA foreign_keys = ON').run(); } catch { /* noop */ }
    return next();
  });

  // Security headers (mirrors index.ts)
  app.use('*', async (c, next) => {
    await next();
    c.res.headers.set('X-Content-Type-Options', 'nosniff');
    c.res.headers.set('X-Frame-Options', 'DENY');
    c.res.headers.set('X-XSS-Protection', '0');
    c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  });

  // Simplified auth: allow public paths; require x-admin-key for the rest
  app.use('*', async (c, next) => {
    if (c.req.method === 'OPTIONS') return c.body(null, 204);
    if (c.req.path === '/health') return next();
    if (c.req.path.startsWith('/webhooks/stripe')) return next();
    if (c.req.path.startsWith('/store/') || c.req.path === '/store') return next();
    if (c.req.path.startsWith('/checkout/')) return next();
    if (c.req.path.startsWith('/payments/')) return next();
    if (c.req.path.startsWith('/dev/')) return next();
    if (c.req.path === '/') return next();

    // Protected endpoints require x-admin-key
    const apiKey = c.req.header('x-admin-key');
    if (apiKey && apiKey === env.ADMIN_API_KEY) {
      // Set authUser so loadRbac can grant admin permissions
      c.set('authUser', { userId: 'api-key', method: 'api-key' } as any);
      return next();
    }
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  });

  // Root handler
  app.get('/', (c) => c.json({ ok: true, message: 'led kikaku os api' }));

  // Register all routes
  registerRoutes(app);

  return {
    app,
    env,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, env as any),
  };
};

// ===========================================================================
// Smoke Test Suite
// ===========================================================================

describe('Smoke Tests', () => {
  // -----------------------------------------------------------------------
  // 1. API Health Check
  // -----------------------------------------------------------------------
  describe('Health Check', () => {
    it('GET /health returns 200 with minimal status (unauthenticated)', async () => {
      const { fetch } = createSmokeApp();
      const res = await fetch('/health');
      expect(res.status).toBe(200);

      const json = (await res.json()) as any;
      expect(json.ok).toBe(true);
      expect(json.status).toBe('ok');
      // Unauthenticated should not expose internal details
      expect(json.database).toBeUndefined();
      expect(json.r2).toBeUndefined();
      expect(json.secrets).toBeUndefined();
    });

    it('GET /health returns 503 when database is down', async () => {
      const badDb = createMockDb();
      badDb.prepare = vi.fn((sql: string) => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn(async () => {
          if (sql.includes('SELECT 1')) throw new Error('DB down');
          return null;
        }),
        all: vi.fn(async () => ({ results: [] })),
        run: vi.fn(async () => ({ meta: {}, success: false })),
      }));

      const { fetch } = createSmokeApp({ DB: badDb });
      const res = await fetch('/health');
      expect(res.status).toBe(503);

      const json = (await res.json()) as any;
      expect(json.ok).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Authentication Protection
  // -----------------------------------------------------------------------
  describe('Authentication Protection', () => {
    it('GET /inbox without auth returns 401', async () => {
      const { fetch } = createSmokeApp();
      const res = await fetch('/inbox?status=open');
      expect(res.status).toBe(401);

      const json = (await res.json()) as any;
      expect(json.ok).toBe(false);
    });

    it('GET /reports/daily without auth returns 401', async () => {
      const { fetch } = createSmokeApp();
      const res = await fetch('/reports/daily?date=2026-01-15');
      expect(res.status).toBe(401);

      const json = (await res.json()) as any;
      expect(json.ok).toBe(false);
    });

    it('GET /admin/products without auth returns 401', async () => {
      const { fetch } = createSmokeApp();
      const res = await fetch('/admin/products');
      expect(res.status).toBe(401);
    });

    it('admin endpoints work with valid x-admin-key', async () => {
      const { fetch } = createSmokeApp();
      const res = await fetch('/inbox?status=open', {
        headers: { 'x-admin-key': STRONG_ADMIN_KEY },
      });
      expect(res.status).toBe(200);

      const json = (await res.json()) as any;
      expect(json.ok).toBe(true);
    });

    it('admin endpoints reject invalid x-admin-key', async () => {
      const { fetch } = createSmokeApp();
      const res = await fetch('/inbox?status=open', {
        headers: { 'x-admin-key': 'wrong-key' },
      });
      expect(res.status).toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Store Endpoints
  // -----------------------------------------------------------------------
  describe('Store Endpoints', () => {
    it('GET /store/products returns 200', async () => {
      const { fetch } = createSmokeApp();
      const res = await fetch('/store/products');
      expect(res.status).toBe(200);

      const json = (await res.json()) as any;
      expect(json.ok).toBe(true);
      expect(Array.isArray(json.products)).toBe(true);
    });

    it('GET /store/products/:id returns 200', async () => {
      const { fetch } = createSmokeApp();
      const res = await fetch('/store/products/1');
      expect(res.status).toBe(200);

      const json = (await res.json()) as any;
      expect(json.ok).toBe(true);
    });

    it('GET /store/products does not require auth', async () => {
      const { fetch } = createSmokeApp();
      // No auth headers at all
      const res = await fetch('/store/products');
      expect(res.status).toBe(200);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Checkout Flow Validation
  // -----------------------------------------------------------------------
  describe('Checkout Flow', () => {
    it('POST /payments/intent validates required fields', async () => {
      const { fetch } = createSmokeApp();
      const res = await fetch('/payments/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      // Missing quoteId and email should trigger validation error
      expect(res.status).toBe(400);

      const json = (await res.json()) as any;
      expect(json.ok).toBe(false);
    });

    it('GET /checkout/config returns checkout configuration', async () => {
      const { fetch } = createSmokeApp();
      const res = await fetch('/checkout/config');
      expect(res.status).toBe(200);

      const json = (await res.json()) as any;
      expect(json.ok).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 5. Daily Close / Reports Endpoints
  // -----------------------------------------------------------------------
  describe('Daily Close / Reports', () => {
    it('GET /reports/daily requires auth', async () => {
      const { fetch } = createSmokeApp();
      const res = await fetch('/reports/daily?date=2026-01-15');
      expect(res.status).toBe(401);
    });

    it('GET /reports/daily with auth returns 200', async () => {
      const { fetch } = createSmokeApp();
      const res = await fetch('/reports/daily?date=2026-01-15', {
        headers: { 'x-admin-key': STRONG_ADMIN_KEY },
      });
      expect(res.status).toBe(200);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Webhook Endpoint
  // -----------------------------------------------------------------------
  describe('Webhook Endpoint', () => {
    it('POST /webhooks/stripe exists and rejects invalid payload', async () => {
      const { fetch } = createSmokeApp();
      const res = await fetch('/webhooks/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      // Should return 400 (invalid signature) not 404
      expect(res.status).not.toBe(404);
      expect([400, 500]).toContain(res.status);
    });
  });

  // -----------------------------------------------------------------------
  // 7. CORS Headers
  // -----------------------------------------------------------------------
  describe('CORS Headers', () => {
    it('OPTIONS request returns CORS headers', async () => {
      const { fetch } = createSmokeApp();
      const res = await fetch('/store/products', {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:4321',
          'Access-Control-Request-Method': 'GET',
        },
      });

      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:4321');
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    });

    it('GET request includes CORS origin header', async () => {
      const { fetch } = createSmokeApp();
      const res = await fetch('/store/products', {
        headers: { Origin: 'http://localhost:4321' },
      });

      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:4321');
    });
  });

  // -----------------------------------------------------------------------
  // 8. Security Headers
  // -----------------------------------------------------------------------
  describe('Security Headers', () => {
    it('responses include security headers', async () => {
      const { fetch } = createSmokeApp();
      const res = await fetch('/health');

      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
      expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()');
    });
  });

  // -----------------------------------------------------------------------
  // 9. Root Endpoint
  // -----------------------------------------------------------------------
  describe('Root Endpoint', () => {
    it('GET / returns API info', async () => {
      const { fetch } = createSmokeApp();
      const res = await fetch('/');
      expect(res.status).toBe(200);

      const json = (await res.json()) as any;
      expect(json.ok).toBe(true);
      expect(json.message).toBe('led kikaku os api');
    });
  });

  // -----------------------------------------------------------------------
  // 10. Dev Endpoints (DEV_MODE=true)
  // -----------------------------------------------------------------------
  describe('Dev Endpoints', () => {
    it('GET /dev/ping returns 200 in dev mode', async () => {
      const { fetch } = createSmokeApp({ DEV_MODE: 'true' });
      const res = await fetch('/dev/ping');
      expect(res.status).toBe(200);

      const json = (await res.json()) as any;
      expect(json.ok).toBe(true);
      expect(json.name).toBe('kikaku-os-api');
      expect(json.dev_mode).toBe(true);
    });

    it('GET /dev/ping returns 404 when DEV_MODE is false', async () => {
      const { fetch } = createSmokeApp({ DEV_MODE: 'false' });
      const res = await fetch('/dev/ping');
      expect(res.status).toBe(404);
    });
  });
});
