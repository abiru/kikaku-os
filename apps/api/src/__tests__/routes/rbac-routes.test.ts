import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../env';
import { loadRbac, requirePermission } from '../../middleware/rbac';
import { PERMISSIONS } from '../../lib/schemas';

/**
 * Tests that routes requiring RBAC properly deny access when
 * the user lacks permissions. Uses real (unmocked) RBAC middleware
 * to verify the routes are correctly protected.
 */

// Mock clerkAuth to simulate unauthenticated access
vi.mock('../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
  timingSafeCompare: (a: string, b: string) => a === b,
}));

// Helper: create a mock DB that returns empty permission sets
const createMockDb = () => ({
  prepare: vi.fn((_sql: string) => ({
    bind: vi.fn((..._args: unknown[]) => ({
      all: vi.fn(async () => ({ results: [] })),
      first: vi.fn(async () => null),
      run: vi.fn(async () => ({ meta: { last_row_id: 1 } })),
    })),
    all: vi.fn(async () => ({ results: [] })),
    first: vi.fn(async () => null),
  })),
});

const createMockR2 = () => ({
  put: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
  list: vi.fn(),
});

describe('RBAC Route Protection', () => {
  describe('Inbox routes', () => {
    let inboxModule: typeof import('../../routes/system/inbox');

    beforeEach(async () => {
      vi.resetModules();
      // Re-import to get fresh module with real RBAC
      inboxModule = await import('../../routes/system/inbox');
    });

    it('GET /inbox returns 401 without authentication', async () => {
      const app = new Hono<Env>();
      app.route('/', inboxModule.default);

      const res = await app.request('http://localhost/inbox', {}, {
        DB: createMockDb(),
      } as any);

      expect(res.status).toBe(401);
    });

    it('POST /inbox/:id/approve returns 401 without authentication', async () => {
      const app = new Hono<Env>();
      app.route('/', inboxModule.default);

      const res = await app.request('http://localhost/inbox/1/approve', {
        method: 'POST',
      }, {
        DB: createMockDb(),
      } as any);

      expect(res.status).toBe(401);
    });

    it('POST /inbox/:id/reject returns 401 without authentication', async () => {
      const app = new Hono<Env>();
      app.route('/', inboxModule.default);

      const res = await app.request('http://localhost/inbox/1/reject', {
        method: 'POST',
      }, {
        DB: createMockDb(),
      } as any);

      expect(res.status).toBe(401);
    });
  });

  describe('Accounting routes', () => {
    let accountingModule: typeof import('../../routes/accounting/accounting');

    beforeEach(async () => {
      vi.resetModules();
      accountingModule = await import('../../routes/accounting/accounting');
    });

    it('GET /ledger-entries returns 401 without authentication', async () => {
      const app = new Hono<Env>();
      app.route('/', accountingModule.default);

      const res = await app.request('http://localhost/ledger-entries?date=2026-01-13', {}, {
        DB: createMockDb(),
      } as any);

      expect(res.status).toBe(401);
    });
  });

  describe('Reports routes', () => {
    let reportsModule: typeof import('../../routes/accounting/reports');

    beforeEach(async () => {
      vi.resetModules();
      reportsModule = await import('../../routes/accounting/reports');
    });

    it('GET /daily returns 401 without authentication', async () => {
      const app = new Hono<Env>();
      app.route('/reports', reportsModule.default);

      const res = await app.request('http://localhost/reports/daily?date=2026-01-13', {}, {
        DB: createMockDb(),
      } as any);

      expect(res.status).toBe(401);
    });
  });

  describe('Daily Close Artifacts routes', () => {
    let dailyCloseModule: typeof import('../../routes/accounting/dailyCloseArtifacts');

    beforeEach(async () => {
      vi.resetModules();
      dailyCloseModule = await import('../../routes/accounting/dailyCloseArtifacts');
    });

    it('POST /daily-close/:date/artifacts returns 401 without authentication', async () => {
      const app = new Hono<Env>();
      app.route('/', dailyCloseModule.default);

      const res = await app.request('http://localhost/daily-close/2026-01-13/artifacts', {
        method: 'POST',
      }, {
        DB: createMockDb(),
        R2: createMockR2(),
      } as any);

      expect(res.status).toBe(401);
    });

    it('GET /daily-close/:date/documents returns 401 without authentication', async () => {
      const app = new Hono<Env>();
      app.route('/', dailyCloseModule.default);

      const res = await app.request('http://localhost/daily-close/2026-01-13/documents', {}, {
        DB: createMockDb(),
        R2: createMockR2(),
      } as any);

      expect(res.status).toBe(401);
    });

    it('GET /daily-close/runs returns 401 without authentication', async () => {
      const app = new Hono<Env>();
      app.route('/', dailyCloseModule.default);

      const res = await app.request('http://localhost/daily-close/runs', {}, {
        DB: createMockDb(),
        R2: createMockR2(),
      } as any);

      expect(res.status).toBe(401);
    });

    it('POST /daily-close/backfill returns 401 without authentication', async () => {
      const app = new Hono<Env>();
      app.route('/', dailyCloseModule.default);

      const res = await app.request('http://localhost/daily-close/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: '2026-01-01', endDate: '2026-01-05' }),
      }, {
        DB: createMockDb(),
        R2: createMockR2(),
      } as any);

      expect(res.status).toBe(401);
    });
  });

  describe('Quotation admin routes', () => {
    let quotationsModule: typeof import('../../routes/checkout/quotations');

    beforeEach(async () => {
      vi.resetModules();
      quotationsModule = await import('../../routes/checkout/quotations');
    });

    it('GET /quotations (list) returns 401 without authentication', async () => {
      const app = new Hono<Env>();
      app.route('/', quotationsModule.default);

      const res = await app.request('http://localhost/quotations', {}, {
        DB: createMockDb(),
      } as any);

      expect(res.status).toBe(401);
    });

    it('DELETE /quotations/:id returns 401 without authentication', async () => {
      const app = new Hono<Env>();
      app.route('/', quotationsModule.default);

      const res = await app.request('http://localhost/quotations/1', {
        method: 'DELETE',
      }, {
        DB: createMockDb(),
      } as any);

      expect(res.status).toBe(401);
    });
  });

  describe('Admin Orders routes (#867)', () => {
    let adminOrdersModule: typeof import('../../routes/admin/adminOrders');

    beforeEach(async () => {
      vi.resetModules();
      adminOrdersModule = await import('../../routes/admin/adminOrders');
    });

    it('GET /admin/orders returns 401 without authentication', async () => {
      const app = new Hono<Env>();
      app.route('/', adminOrdersModule.default);

      const res = await app.request('http://localhost/admin/orders', {}, {
        DB: createMockDb(),
      } as any);

      expect(res.status).toBe(401);
    });

    it('GET /admin/orders/:id returns 401 without authentication', async () => {
      const app = new Hono<Env>();
      app.route('/', adminOrdersModule.default);

      const res = await app.request('http://localhost/admin/orders/1', {}, {
        DB: createMockDb(),
      } as any);

      expect(res.status).toBe(401);
    });

    it('POST /admin/orders/:id/refunds returns 401 without authentication', async () => {
      const app = new Hono<Env>();
      app.route('/', adminOrdersModule.default);

      const res = await app.request('http://localhost/admin/orders/1/refunds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'test' }),
      }, {
        DB: createMockDb(),
      } as any);

      expect(res.status).toBe(401);
    });

    it('POST /admin/orders/:id/cancel returns 401 without authentication', async () => {
      const app = new Hono<Env>();
      app.route('/', adminOrdersModule.default);

      const res = await app.request('http://localhost/admin/orders/1/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'test' }),
      }, {
        DB: createMockDb(),
      } as any);

      expect(res.status).toBe(401);
    });
  });
});

/**
 * Tests that admin routes enforce permission-based access control.
 * Uses real loadRbac middleware with a mock DB that returns
 * specific role/permissions per user, NOT full admin permissions.
 */

// Helper: create a mock DB that returns a specific admin user with limited permissions
const createPermissionDb = (
  clerkUserId: string,
  roleId: string,
  permissions: string[]
) => ({
  prepare: (_sql: string) => {
    const createHandlers = (sql: string, args: unknown[] = []) => ({
      all: async () => {
        if (sql.includes('FROM permissions p') && sql.includes('role_permissions')) {
          return { results: permissions.map((id) => ({ id })) };
        }
        return { results: [] };
      },
      first: async () => {
        if (sql.includes('FROM admin_users') && sql.includes('clerk_user_id')) {
          if (args[0] === clerkUserId) {
            return {
              id: 1,
              clerk_user_id: clerkUserId,
              email: `${roleId}@example.com`,
              name: `Test ${roleId}`,
              role_id: roleId,
              is_active: 1,
              last_login_at: null,
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
            };
          }
          return null;
        }
        if (sql.includes('COUNT(*)')) {
          return { count: 0 };
        }
        return null;
      },
      run: async () => ({ success: true, meta: {} }),
      bind: (...bindArgs: unknown[]) => createHandlers(sql, bindArgs),
    });

    return createHandlers(_sql, []);
  },
});

// Helper: create an app that pre-sets authUser (simulating clerkAuth)
const createAuthenticatedApp = (
  routeModule: any,
  clerkUserId: string
) => {
  const app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('authUser', {
      userId: clerkUserId,
      email: `${clerkUserId}@example.com`,
      method: 'clerk' as const,
    });
    await next();
  });
  app.route('/', routeModule);
  return app;
};

describe('RBAC Permission Enforcement (#867)', () => {
  describe('Admin Orders - permission denied', () => {
    let adminOrdersModule: typeof import('../../routes/admin/adminOrders');

    beforeEach(async () => {
      vi.resetModules();
      adminOrdersModule = await import('../../routes/admin/adminOrders');
    });

    it('GET /admin/orders returns 403 for user without orders:read', async () => {
      const db = createPermissionDb('user_accountant', 'accountant', ['reports:read', 'ledger:read']);
      const app = createAuthenticatedApp(adminOrdersModule.default, 'user_accountant');

      const res = await app.request('http://localhost/admin/orders', {}, {
        DB: db,
      } as any);

      expect(res.status).toBe(403);
      const json = await res.json() as any;
      expect(json.message).toContain('orders:read');
    });

    it('POST /admin/orders/:id/refunds returns 403 for viewer with only orders:read', async () => {
      const db = createPermissionDb('user_viewer', 'viewer', ['orders:read']);
      const app = createAuthenticatedApp(adminOrdersModule.default, 'user_viewer');

      const res = await app.request('http://localhost/admin/orders/1/refunds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'test' }),
      }, {
        DB: db,
      } as any);

      expect(res.status).toBe(403);
      const json = await res.json() as any;
      expect(json.message).toContain('orders:write');
    });

    it('POST /admin/orders/:id/cancel returns 403 for viewer with only orders:read', async () => {
      const db = createPermissionDb('user_viewer', 'viewer', ['orders:read']);
      const app = createAuthenticatedApp(adminOrdersModule.default, 'user_viewer');

      const res = await app.request('http://localhost/admin/orders/1/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'test' }),
      }, {
        DB: db,
      } as any);

      expect(res.status).toBe(403);
      const json = await res.json() as any;
      expect(json.message).toContain('orders:write');
    });
  });

  describe('Admin Orders - role-based access', () => {
    let adminOrdersModule: typeof import('../../routes/admin/adminOrders');

    beforeEach(async () => {
      vi.resetModules();
      adminOrdersModule = await import('../../routes/admin/adminOrders');
    });

    it('admin role with orders:read can access GET /admin/orders', async () => {
      const db = createPermissionDb('user_admin', 'admin', [
        'orders:read', 'orders:write', 'products:read', 'products:write',
      ]);
      const app = createAuthenticatedApp(adminOrdersModule.default, 'user_admin');

      const res = await app.request('http://localhost/admin/orders', {}, {
        DB: db,
      } as any);

      // Should not be 401 or 403 — may be 200 or 500 depending on mock data
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it('user not in admin_users table gets 401', async () => {
      // DB returns null for admin_users lookup → rbacUser = null → 401
      const db = createPermissionDb('user_unknown', 'viewer', []);
      const app = createAuthenticatedApp(adminOrdersModule.default, 'user_not_in_db');

      const res = await app.request('http://localhost/admin/orders', {}, {
        DB: db,
      } as any);

      expect(res.status).toBe(401);
    });
  });
});
