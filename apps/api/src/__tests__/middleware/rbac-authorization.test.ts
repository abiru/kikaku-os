import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../env';
import type { AdminUserRow } from '../../lib/schemas/rbac';
import { PERMISSIONS } from '../../lib/schemas';

/**
 * RBAC Authorization Integration Tests (#867)
 *
 * These tests exercise the REAL loadRbac + requirePermission middleware
 * without vi.mock() — only clerkAuth is stubbed (to avoid JWT verification).
 *
 * The mock DB returns role-specific permission sets so that the middleware
 * actually queries permissions and enforces access control.
 */

// Only mock clerkAuth (JWT verification) — RBAC middleware is NOT mocked
vi.mock('../../middleware/clerkAuth', () => ({
  getActor: () => 'test-actor',
  timingSafeCompare: (a: string, b: string) => a === b,
}));

// ---------- Mock DB factory ----------

interface MockAdminUser {
  clerkUserId: string;
  roleId: string;
  permissions: string[];
}

const createMockDb = (users: MockAdminUser[]) => ({
  prepare: (sql: string) => {
    const createHandlers = (boundSql: string, args: unknown[] = []) => ({
      first: async <T>() => {
        // Admin user lookup
        if (boundSql.includes('FROM admin_users') && boundSql.includes('clerk_user_id')) {
          const clerkId = args[0] as string;
          const user = users.find((u) => u.clerkUserId === clerkId);
          if (!user) return null as T;
          return {
            id: 1,
            clerk_user_id: user.clerkUserId,
            email: `${user.roleId}@example.com`,
            name: `Test ${user.roleId}`,
            role_id: user.roleId,
            is_active: 1,
            last_login_at: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          } as T;
        }
        // COUNT queries (for route handlers)
        if (boundSql.includes('COUNT(*)') || boundSql.includes('COUNT(DISTINCT')) {
          return { count: 0 } as T;
        }
        return null as T;
      },
      all: async <T>() => {
        // Permission lookup for role
        if (boundSql.includes('FROM permissions p') && boundSql.includes('role_permissions')) {
          let roleId = args[0] as string | undefined;
          // For API-key path, roleId is embedded in SQL as WHERE rp.role_id = 'admin'
          if (!roleId || roleId === '') {
            const match = boundSql.match(/role_id\s*=\s*'(\w+)'/);
            roleId = match?.[1];
          }
          if (!roleId) {
            return { results: [] as T[] };
          }
          const user = users.find((u) => u.roleId === roleId);
          const perms = user?.permissions ?? [];
          return { results: perms.map((id) => ({ id })) as T[] };
        }
        return { results: [] as T[] };
      },
      run: async () => ({ success: true, meta: { last_row_id: 1, changes: 0 } }),
      bind: (...bindArgs: unknown[]) => createHandlers(boundSql, bindArgs),
    });

    return createHandlers(sql, []);
  },
});

const createMockR2 = () => ({
  put: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
  list: vi.fn(async () => ({ objects: [], truncated: false })),
});

// ---------- App factory ----------

/**
 * Creates a Hono app that pre-sets authUser (simulating clerkAuth)
 * then mounts the given route module. The real loadRbac + requirePermission
 * middleware inside the route module run against the mock DB.
 */
const createTestApp = (
  routeModule: { default: any } | any,
  clerkUserId: string | null,
  basePath = '/'
) => {
  const app = new Hono<Env>();

  // Simulate clerkAuth — set authUser based on test scenario
  app.use('*', async (c, next) => {
    if (clerkUserId) {
      c.set('authUser', {
        userId: clerkUserId,
        email: `${clerkUserId}@example.com`,
        method: 'clerk' as const,
      });
    } else {
      c.set('authUser', null);
    }
    await next();
  });

  const mod = routeModule.default ?? routeModule;
  app.route(basePath, mod);
  return app;
};

// ---------- Test users ----------

const ADMIN_USER: MockAdminUser = {
  clerkUserId: 'user_admin',
  roleId: 'admin',
  permissions: [
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.ORDERS_WRITE,
    PERMISSIONS.PRODUCTS_READ,
    PERMISSIONS.PRODUCTS_WRITE,
    PERMISSIONS.PRODUCTS_DELETE,
    PERMISSIONS.SETTINGS_READ,
    PERMISSIONS.SETTINGS_WRITE,
    PERMISSIONS.CUSTOMERS_READ,
    PERMISSIONS.CUSTOMERS_WRITE,
    PERMISSIONS.REPORTS_READ,
    PERMISSIONS.LEDGER_READ,
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.USERS_READ,
    PERMISSIONS.USERS_WRITE,
    PERMISSIONS.USERS_DELETE,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_WRITE,
    PERMISSIONS.INBOX_READ,
    PERMISSIONS.INBOX_APPROVE,
    PERMISSIONS.TAX_RATES_READ,
    PERMISSIONS.TAX_RATES_WRITE,
  ],
};

const VIEWER_USER: MockAdminUser = {
  clerkUserId: 'user_viewer',
  roleId: 'viewer',
  permissions: [PERMISSIONS.ORDERS_READ, PERMISSIONS.PRODUCTS_READ, PERMISSIONS.DASHBOARD_READ],
};

const ACCOUNTANT_USER: MockAdminUser = {
  clerkUserId: 'user_accountant',
  roleId: 'accountant',
  permissions: [PERMISSIONS.REPORTS_READ, PERMISSIONS.LEDGER_READ],
};

const ALL_USERS = [ADMIN_USER, VIEWER_USER, ACCOUNTANT_USER];

// ---------- Route definitions to test ----------

interface RouteTestCase {
  modulePath: string;
  description: string;
  endpoints: {
    method: string;
    path: string;
    requiredPermission: string;
    body?: Record<string, unknown>;
  }[];
}

const ADMIN_ROUTE_TESTS: RouteTestCase[] = [
  {
    modulePath: '../../routes/admin/adminOrders',
    description: 'Admin Orders',
    endpoints: [
      { method: 'GET', path: '/admin/orders', requiredPermission: PERMISSIONS.ORDERS_READ },
      { method: 'GET', path: '/admin/orders/1', requiredPermission: PERMISSIONS.ORDERS_READ },
      {
        method: 'POST',
        path: '/admin/orders/1/refunds',
        requiredPermission: PERMISSIONS.ORDERS_WRITE,
        body: { reason: 'test', amount: 100 },
      },
      {
        method: 'POST',
        path: '/admin/orders/1/cancel',
        requiredPermission: PERMISSIONS.ORDERS_WRITE,
        body: { reason: 'test' },
      },
    ],
  },
  {
    modulePath: '../../routes/admin/adminProducts',
    description: 'Admin Products',
    endpoints: [
      { method: 'GET', path: '/products', requiredPermission: PERMISSIONS.PRODUCTS_READ },
      { method: 'GET', path: '/products/1', requiredPermission: PERMISSIONS.PRODUCTS_READ },
    ],
  },
  {
    modulePath: '../../routes/admin/adminCategories',
    description: 'Admin Categories',
    endpoints: [
      { method: 'GET', path: '/categories', requiredPermission: PERMISSIONS.PRODUCTS_READ },
    ],
  },
  {
    modulePath: '../../routes/admin/adminSettings',
    description: 'Admin Settings',
    endpoints: [
      { method: 'GET', path: '/settings', requiredPermission: PERMISSIONS.SETTINGS_READ },
    ],
  },
  {
    modulePath: '../../routes/admin/adminCustomers',
    description: 'Admin Customers',
    endpoints: [
      { method: 'GET', path: '/customers', requiredPermission: PERMISSIONS.CUSTOMERS_READ },
    ],
  },
  {
    modulePath: '../../routes/admin/adminReviews',
    description: 'Admin Reviews',
    endpoints: [
      { method: 'GET', path: '/reviews', requiredPermission: PERMISSIONS.PRODUCTS_READ },
    ],
  },
  {
    modulePath: '../../routes/admin/adminTaxRates',
    description: 'Admin Tax Rates',
    endpoints: [
      { method: 'GET', path: '/', requiredPermission: PERMISSIONS.TAX_RATES_READ },
    ],
  },
  {
    modulePath: '../../routes/admin/adminStripeEvents',
    description: 'Admin Stripe Events',
    endpoints: [
      { method: 'GET', path: '/stripe-events', requiredPermission: PERMISSIONS.ORDERS_READ },
    ],
  },
  {
    modulePath: '../../routes/admin/adminReports',
    description: 'Admin Reports',
    endpoints: [
      { method: 'GET', path: '/dashboard', requiredPermission: PERMISSIONS.DASHBOARD_READ },
    ],
  },
  {
    modulePath: '../../routes/admin/adminAuditLogs',
    description: 'Admin Audit Logs',
    endpoints: [
      { method: 'GET', path: '/', requiredPermission: PERMISSIONS.SETTINGS_READ },
    ],
  },
  {
    modulePath: '../../routes/admin/adminInquiries',
    description: 'Admin Inquiries',
    endpoints: [
      { method: 'GET', path: '/inquiries', requiredPermission: PERMISSIONS.CUSTOMERS_READ },
    ],
  },
  {
    modulePath: '../../routes/admin/adminNewsletter',
    description: 'Admin Newsletter',
    endpoints: [
      { method: 'GET', path: '/subscribers', requiredPermission: PERMISSIONS.CUSTOMERS_READ },
    ],
  },
];

// ---------- Tests ----------

describe('RBAC Authorization Integration (#867)', () => {
  describe.each(ADMIN_ROUTE_TESTS)(
    '$description',
    ({ modulePath, endpoints }) => {
      let routeModule: any;

      beforeEach(async () => {
        vi.resetModules();
        routeModule = await import(modulePath);
      });

      describe.each(endpoints)(
        '$method $path (requires $requiredPermission)',
        ({ method, path, requiredPermission, body }) => {
          const db = createMockDb(ALL_USERS);
          const env = { DB: db, R2: createMockR2() } as any;

          it('returns 401 for unauthenticated user (no authUser)', async () => {
            const app = createTestApp(routeModule, null);

            const reqInit: RequestInit = { method };
            if (body) {
              reqInit.headers = { 'Content-Type': 'application/json' };
              reqInit.body = JSON.stringify(body);
            }

            const res = await app.request(`http://localhost${path}`, reqInit, env);
            expect(res.status).toBe(401);
          });

          it('returns 401 for user not in admin_users table', async () => {
            // user_unknown is not in ALL_USERS → DB returns null → rbacUser null → 401
            const app = createTestApp(routeModule, 'user_unknown');

            const reqInit: RequestInit = { method };
            if (body) {
              reqInit.headers = { 'Content-Type': 'application/json' };
              reqInit.body = JSON.stringify(body);
            }

            const res = await app.request(`http://localhost${path}`, reqInit, env);
            expect(res.status).toBe(401);
          });

          it('returns 403 for user lacking required permission', async () => {
            // Find a user who does NOT have this permission
            const unauthorizedUser = ALL_USERS.find(
              (u) => !u.permissions.includes(requiredPermission)
            );
            if (!unauthorizedUser) {
              // All test users have this permission — skip
              return;
            }

            const app = createTestApp(routeModule, unauthorizedUser.clerkUserId);

            const reqInit: RequestInit = { method };
            if (body) {
              reqInit.headers = { 'Content-Type': 'application/json' };
              reqInit.body = JSON.stringify(body);
            }

            const res = await app.request(`http://localhost${path}`, reqInit, env);
            expect(res.status).toBe(403);
            const json = (await res.json()) as any;
            expect(json.message).toContain('Forbidden');
          });

          it('passes authorization for admin user with all permissions', async () => {
            const app = createTestApp(routeModule, ADMIN_USER.clerkUserId);

            const reqInit: RequestInit = { method };
            if (body) {
              reqInit.headers = { 'Content-Type': 'application/json' };
              reqInit.body = JSON.stringify(body);
            }

            const res = await app.request(`http://localhost${path}`, reqInit, env);
            // Should NOT be 401 or 403 — route handler runs (may return 200/400/500
            // depending on mock data, but auth is satisfied)
            expect(res.status).not.toBe(401);
            expect(res.status).not.toBe(403);
          });
        }
      );
    }
  );

  describe('Role-specific access patterns', () => {
    let adminOrdersModule: any;
    let adminReportsModule: any;

    beforeEach(async () => {
      vi.resetModules();
      adminOrdersModule = await import('../../routes/admin/adminOrders');
      adminReportsModule = await import('../../routes/admin/adminReports');
    });

    const db = createMockDb(ALL_USERS);
    const env = { DB: db, R2: createMockR2() } as any;

    it('viewer can read orders but cannot write', async () => {
      // viewer has orders:read
      const readApp = createTestApp(adminOrdersModule, VIEWER_USER.clerkUserId);
      const readRes = await readApp.request(
        'http://localhost/admin/orders',
        { method: 'GET' },
        env
      );
      expect(readRes.status).not.toBe(401);
      expect(readRes.status).not.toBe(403);

      // viewer does NOT have orders:write
      const writeApp = createTestApp(adminOrdersModule, VIEWER_USER.clerkUserId);
      const writeRes = await writeApp.request(
        'http://localhost/admin/orders/1/refunds',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'test', amount: 100 }),
        },
        env
      );
      expect(writeRes.status).toBe(403);
    });

    it('accountant can read reports but cannot read orders', async () => {
      // accountant has reports:read
      const reportsApp = createTestApp(adminReportsModule, ACCOUNTANT_USER.clerkUserId);
      const reportsRes = await reportsApp.request(
        'http://localhost/reports',
        { method: 'GET' },
        env
      );
      // reports route may return data or error from mock, but NOT 401/403
      expect(reportsRes.status).not.toBe(401);
      expect(reportsRes.status).not.toBe(403);

      // accountant does NOT have orders:read
      const ordersApp = createTestApp(adminOrdersModule, ACCOUNTANT_USER.clerkUserId);
      const ordersRes = await ordersApp.request(
        'http://localhost/admin/orders',
        { method: 'GET' },
        env
      );
      expect(ordersRes.status).toBe(403);
    });

    it('admin can access both orders and reports', async () => {
      const ordersApp = createTestApp(adminOrdersModule, ADMIN_USER.clerkUserId);
      const ordersRes = await ordersApp.request(
        'http://localhost/admin/orders',
        { method: 'GET' },
        env
      );
      expect(ordersRes.status).not.toBe(401);
      expect(ordersRes.status).not.toBe(403);

      const reportsApp = createTestApp(adminReportsModule, ADMIN_USER.clerkUserId);
      const reportsRes = await reportsApp.request(
        'http://localhost/reports',
        { method: 'GET' },
        env
      );
      expect(reportsRes.status).not.toBe(401);
      expect(reportsRes.status).not.toBe(403);
    });
  });

  describe('API key authentication', () => {
    let adminOrdersModule: any;

    beforeEach(async () => {
      vi.resetModules();
      adminOrdersModule = await import('../../routes/admin/adminOrders');
    });

    it('grants admin access via x-admin-key with real RBAC', async () => {
      const db = createMockDb(ALL_USERS);
      const env = { DB: db, R2: createMockR2() } as any;

      const app = new Hono<Env>();
      // Simulate API key auth (sets method: 'api-key')
      app.use('*', async (c, next) => {
        c.set('authUser', {
          userId: 'admin',
          method: 'api-key' as const,
        });
        await next();
      });
      app.route('/', adminOrdersModule.default);

      const res = await app.request('http://localhost/admin/orders', {}, env);
      // API key users get full admin role in loadRbac
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });
});
