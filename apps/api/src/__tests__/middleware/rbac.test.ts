import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../env';
import type { AuthUser } from '../../middleware/clerkAuth';
import {
  loadRbac,
  requirePermission,
  requireRole,
  requireMinRole,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  type AuthUserWithRbac,
} from '../../middleware/rbac';
import type { AdminUserRow } from '../../lib/schemas/rbac';

// Mock database responses
const createMockEnv = () => {
  const calls: { sql: string; bind: unknown[] }[] = [];

  const adminUsers: AdminUserRow[] = [
    {
      id: 1,
      clerk_user_id: 'user_clerk123',
      email: 'manager@example.com',
      name: 'Test Manager',
      role_id: 'manager',
      is_active: 1,
      last_login_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];

  const permissions = [
    { id: 'orders.view' },
    { id: 'orders.manage' },
    { id: 'products.manage' },
    { id: 'reports.view' },
  ];

  const rolePermissions: Record<string, string[]> = {
    admin: ['orders.view', 'orders.manage', 'products.manage', 'reports.view'],
    manager: ['orders.view', 'reports.view'],
    accountant: ['reports.view'],
    viewer: ['orders.view'],
  };

  const env: Env['Bindings'] = {
    ADMIN_API_KEY: 'test-admin-key',
    DEV_MODE: 'false',
    STRIPE_SECRET_KEY: 'sk_test_xxx',
    STRIPE_WEBHOOK_SECRET: 'whsec_xxx',
    STOREFRONT_BASE_URL: 'http://localhost:4321',
    CLERK_SECRET_KEY: 'sk_test_xxx',
    R2: {} as R2Bucket,
    DB: {
      prepare: (sql: string) => {
        const createHandlers = (args: unknown[] = []) => ({
          first: async <T>() => {
            calls.push({ sql, bind: args });

            // Fetch admin user by clerk_user_id
            if (sql.includes('FROM admin_users') && sql.includes('WHERE clerk_user_id')) {
              const clerkId = args[0] as string;
              const user = adminUsers.find((u) => u.clerk_user_id === clerkId && u.is_active === 1);
              return user as T | undefined;
            }

            return null as T;
          },

          all: async <T>() => {
            calls.push({ sql, bind: args });

            // Fetch permissions for role
            if (sql.includes('FROM permissions p') && sql.includes('role_permissions')) {
              // Extract role_id from args or default to 'admin' for API key path
              const roleId = (args[0] as string) || 'admin';
              const perms = rolePermissions[roleId] || [];
              return {
                results: perms.map((id) => ({ id })) as T[],
              };
            }

            return { results: [] as T[] };
          },

          run: async () => {
            calls.push({ sql, bind: args });
            return { success: true, meta: {} };
          },

          // Support bind chaining
          bind: (...bindArgs: unknown[]) => createHandlers(bindArgs),
        });

        // Return handlers that support both direct call and bind()
        return createHandlers([]);
      },
    } as unknown as D1Database,
  };

  return { env, calls };
};

describe('loadRbac middleware', () => {
  const createApp = (env: Env) => {
    const app = new Hono<Env>();

    // Mock authUser middleware
    app.use('*', async (c, next) => {
      const mockAuth = c.req.header('x-mock-auth');
      c.set('authUser', mockAuth ? JSON.parse(mockAuth) : null);
      await next();
    });

    app.use('*', loadRbac);

    app.get('/test', (c) => {
      const rbacUser = c.get('rbacUser');
      return c.json({ rbacUser });
    });

    return app;
  };

  describe('API key authentication', () => {
    it('grants full admin permissions to API key users', async () => {
      const { env } = createMockEnv();

      const app = createApp(env as any);
      const authUser: AuthUser = {
        userId: 'admin',
        method: 'api-key',
      };

      const res = await app.request('/test', {
        headers: {
          'x-mock-auth': JSON.stringify(authUser),
        },
      }, env as any);

      expect(res.status).toBe(200);
      const body = await res.json<{ rbacUser: AuthUserWithRbac }>();

      expect(body.rbacUser).toMatchObject({
        userId: 'admin',
        method: 'api-key',
        role: 'admin',
        permissions: expect.arrayContaining(['orders.view', 'orders.manage', 'products.manage']),
      });
    });

    it('handles empty permissions for API key user', async () => {
      // Create environment with no permissions for admin role
      const { env } = createMockEnv();
      const calls: { sql: string; bind: unknown[] }[] = [];

      env.DB = {
        prepare: (sql: string) => {
          const createHandlers = (args: unknown[] = []) => ({
            first: async <T>() => {
              calls.push({ sql, bind: args });
              return null as T;
            },

            all: async <T>() => {
              calls.push({ sql, bind: args });
              // Return empty permissions array
              return { results: [] as T[] };
            },

            run: async () => {
              calls.push({ sql, bind: args });
              return { success: true, meta: {} };
            },

            bind: (...bindArgs: unknown[]) => createHandlers(bindArgs),
          });

          return createHandlers([]);
        },
      } as unknown as D1Database;

      const app = createApp(env as any);
      const authUser: AuthUser = {
        userId: 'admin',
        method: 'api-key',
      };

      const res = await app.request('/test', {
        headers: {
          'x-mock-auth': JSON.stringify(authUser),
        },
      }, env as any);

      expect(res.status).toBe(200);
      const body = await res.json<{ rbacUser: AuthUserWithRbac }>();
      expect(body.rbacUser.permissions).toEqual([]);
    });
  });

  describe('Clerk user authentication', () => {
    it('loads RBAC info for valid Clerk user', async () => {
      const { env, calls } = createMockEnv();

      const app = createApp(env as any);
      const authUser: AuthUser = {
        userId: 'user_clerk123',
        email: 'manager@example.com',
        method: 'clerk',
      };

      const res = await app.request('/test', {
        headers: {
          'x-mock-auth': JSON.stringify(authUser),
        },
      }, env as any);

      expect(res.status).toBe(200);
      const body = await res.json<{ rbacUser: AuthUserWithRbac }>();

      expect(body.rbacUser).toMatchObject({
        userId: 'user_clerk123',
        email: 'manager@example.com',
        method: 'clerk',
        role: 'manager',
        permissions: ['orders.view', 'reports.view'],
      });

      expect(body.rbacUser.adminUser).toMatchObject({
        clerk_user_id: 'user_clerk123',
        email: 'manager@example.com',
      });

      // Verify last_login_at was updated
      const updateCall = calls.find((c) => c.sql.includes('UPDATE admin_users SET last_login_at'));
      expect(updateCall).toBeTruthy();
    });

    it('sets rbacUser to null for Clerk user not in admin_users', async () => {
      const { env } = createMockEnv();

      const app = createApp(env as any);
      const authUser: AuthUser = {
        userId: 'user_unknown',
        email: 'unknown@example.com',
        method: 'clerk',
      };

      const res = await app.request('/test', {
        headers: {
          'x-mock-auth': JSON.stringify(authUser),
        },
      }, env as any);

      expect(res.status).toBe(200);
      const body = await res.json<{ rbacUser: AuthUserWithRbac | null }>();
      expect(body.rbacUser).toBe(null);
    });

    it('handles inactive Clerk user', async () => {
      const { env } = createMockEnv();

      const app = createApp(env as any);
      const authUser: AuthUser = {
        userId: 'user_inactive',
        email: 'inactive@example.com',
        method: 'clerk',
      };

      const res = await app.request('/test', {
        headers: {
          'x-mock-auth': JSON.stringify(authUser),
        },
      }, env as any);

      expect(res.status).toBe(200);
      const body = await res.json<{ rbacUser: AuthUserWithRbac | null }>();
      expect(body.rbacUser).toBe(null);
    });
  });

  describe('unauthenticated users', () => {
    it('sets rbacUser to null for unauthenticated request', async () => {
      const { env } = createMockEnv();
      const app = createApp(env as any);

      const res = await app.request('/test', {
        headers: {
          'x-mock-auth': JSON.stringify(null),
        },
      }, env as any);

      expect(res.status).toBe(200);
      const body = await res.json<{ rbacUser: AuthUserWithRbac | null }>();
      expect(body.rbacUser).toBe(null);
    });
  });
});

describe('requirePermission middleware', () => {
  const createApp = (permissions: string[]) => {
    const app = new Hono<Env>();

    app.use('*', async (c, next) => {
      const mockRbacUser = c.req.header('x-mock-rbac');
      c.set('rbacUser', mockRbacUser ? JSON.parse(mockRbacUser) : null);
      await next();
    });

    app.use('*', requirePermission(...permissions));
    app.get('/protected', (c) => c.json({ ok: true }));

    return app;
  };

  it('allows access with required permission', async () => {
    const app = createApp(['orders.view']);
    const rbacUser: AuthUserWithRbac = {
      userId: 'user_1',
      method: 'clerk',
      role: 'manager',
      permissions: ['orders.view', 'reports.view'],
    };

    const res = await app.request('/protected', {
      headers: {
        'x-mock-rbac': JSON.stringify(rbacUser),
      },
    });

    expect(res.status).toBe(200);
  });

  it('allows access when user has any of multiple required permissions', async () => {
    const app = createApp(['orders.manage', 'orders.view']);
    const rbacUser: AuthUserWithRbac = {
      userId: 'user_2',
      method: 'clerk',
      role: 'viewer',
      permissions: ['orders.view'], // Has one of the required permissions
    };

    const res = await app.request('/protected', {
      headers: {
        'x-mock-rbac': JSON.stringify(rbacUser),
      },
    });

    expect(res.status).toBe(200);
  });

  it('denies access without required permission', async () => {
    const app = createApp(['orders.manage']);
    const rbacUser: AuthUserWithRbac = {
      userId: 'user_3',
      method: 'clerk',
      role: 'viewer',
      permissions: ['orders.view'], // Missing orders.manage
    };

    const res = await app.request('/protected', {
      headers: {
        'x-mock-rbac': JSON.stringify(rbacUser),
      },
    });

    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.message).toContain('Forbidden');
    expect(body.message).toContain('orders.manage');
  });

  it('denies access when rbacUser is null', async () => {
    const app = createApp(['orders.view']);

    const res = await app.request('/protected', {
      headers: {
        'x-mock-rbac': JSON.stringify(null),
      },
    });

    expect(res.status).toBe(401);
    const body = await res.json() as any;
    expect(body.message).toContain('Unauthorized');
  });

  it('handles multiple permission requirements correctly', async () => {
    const app = createApp(['products.manage', 'inventory.manage', 'orders.manage']);
    const rbacUser: AuthUserWithRbac = {
      userId: 'user_4',
      method: 'clerk',
      role: 'manager',
      permissions: ['inventory.manage', 'reports.view'], // Has one required permission
    };

    const res = await app.request('/protected', {
      headers: {
        'x-mock-rbac': JSON.stringify(rbacUser),
      },
    });

    expect(res.status).toBe(200);
  });
});

describe('requireRole middleware', () => {
  const createApp = (roles: string[]) => {
    const app = new Hono<Env>();

    app.use('*', async (c, next) => {
      const mockRbacUser = c.req.header('x-mock-rbac');
      c.set('rbacUser', mockRbacUser ? JSON.parse(mockRbacUser) : null);
      await next();
    });

    app.use('*', requireRole(...(roles as any)));
    app.get('/protected', (c) => c.json({ ok: true }));

    return app;
  };

  it('allows access with required role', async () => {
    const app = createApp(['manager']);
    const rbacUser: AuthUserWithRbac = {
      userId: 'user_5',
      method: 'clerk',
      role: 'manager',
      permissions: ['orders.view'],
    };

    const res = await app.request('/protected', {
      headers: {
        'x-mock-rbac': JSON.stringify(rbacUser),
      },
    });

    expect(res.status).toBe(200);
  });

  it('allows access when user has any of multiple required roles', async () => {
    const app = createApp(['admin', 'manager']);
    const rbacUser: AuthUserWithRbac = {
      userId: 'user_6',
      method: 'clerk',
      role: 'manager',
      permissions: [],
    };

    const res = await app.request('/protected', {
      headers: {
        'x-mock-rbac': JSON.stringify(rbacUser),
      },
    });

    expect(res.status).toBe(200);
  });

  it('denies access without required role', async () => {
    const app = createApp(['admin']);
    const rbacUser: AuthUserWithRbac = {
      userId: 'user_7',
      method: 'clerk',
      role: 'viewer',
      permissions: ['orders.view'],
    };

    const res = await app.request('/protected', {
      headers: {
        'x-mock-rbac': JSON.stringify(rbacUser),
      },
    });

    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.message).toContain('Forbidden');
    expect(body.message).toContain('admin');
  });

  it('denies access when rbacUser is null', async () => {
    const app = createApp(['manager']);

    const res = await app.request('/protected', {
      headers: {
        'x-mock-rbac': JSON.stringify(null),
      },
    });

    expect(res.status).toBe(401);
    const body = await res.json() as any;
    expect(body.message).toContain('Unauthorized');
  });
});

describe('requireMinRole middleware', () => {
  const createApp = (minRole: string) => {
    const app = new Hono<Env>();

    app.use('*', async (c, next) => {
      const mockRbacUser = c.req.header('x-mock-rbac');
      c.set('rbacUser', mockRbacUser ? JSON.parse(mockRbacUser) : null);
      await next();
    });

    app.use('*', requireMinRole(minRole as any));
    app.get('/protected', (c) => c.json({ ok: true }));

    return app;
  };

  it('allows admin to access manager-restricted route', async () => {
    const app = createApp('manager');
    const rbacUser: AuthUserWithRbac = {
      userId: 'user_8',
      method: 'clerk',
      role: 'admin',
      permissions: [],
    };

    const res = await app.request('/protected', {
      headers: {
        'x-mock-rbac': JSON.stringify(rbacUser),
      },
    });

    expect(res.status).toBe(200);
  });

  it('allows manager to access manager-restricted route', async () => {
    const app = createApp('manager');
    const rbacUser: AuthUserWithRbac = {
      userId: 'user_9',
      method: 'clerk',
      role: 'manager',
      permissions: [],
    };

    const res = await app.request('/protected', {
      headers: {
        'x-mock-rbac': JSON.stringify(rbacUser),
      },
    });

    expect(res.status).toBe(200);
  });

  it('denies viewer access to manager-restricted route', async () => {
    const app = createApp('manager');
    const rbacUser: AuthUserWithRbac = {
      userId: 'user_10',
      method: 'clerk',
      role: 'viewer',
      permissions: [],
    };

    const res = await app.request('/protected', {
      headers: {
        'x-mock-rbac': JSON.stringify(rbacUser),
      },
    });

    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.message).toContain('Forbidden');
    expect(body.message).toContain('manager');
  });

  it('allows accountant to access accountant-restricted route', async () => {
    const app = createApp('accountant');
    const rbacUser: AuthUserWithRbac = {
      userId: 'user_11',
      method: 'clerk',
      role: 'accountant',
      permissions: [],
    };

    const res = await app.request('/protected', {
      headers: {
        'x-mock-rbac': JSON.stringify(rbacUser),
      },
    });

    expect(res.status).toBe(200);
  });

  it('denies viewer access to accountant-restricted route', async () => {
    const app = createApp('accountant');
    const rbacUser: AuthUserWithRbac = {
      userId: 'user_12',
      method: 'clerk',
      role: 'viewer',
      permissions: [],
    };

    const res = await app.request('/protected', {
      headers: {
        'x-mock-rbac': JSON.stringify(rbacUser),
      },
    });

    expect(res.status).toBe(403);
  });

  it('allows admin to access all routes', async () => {
    const app = createApp('viewer');
    const rbacUser: AuthUserWithRbac = {
      userId: 'user_13',
      method: 'clerk',
      role: 'admin',
      permissions: [],
    };

    const res = await app.request('/protected', {
      headers: {
        'x-mock-rbac': JSON.stringify(rbacUser),
      },
    });

    expect(res.status).toBe(200);
  });

  it('denies access when rbacUser is null', async () => {
    const app = createApp('viewer');

    const res = await app.request('/protected', {
      headers: {
        'x-mock-rbac': JSON.stringify(null),
      },
    });

    expect(res.status).toBe(401);
  });
});

describe('permission helper functions', () => {
  describe('hasPermission', () => {
    it('returns true when user has permission', () => {
      const rbacUser: AuthUserWithRbac = {
        userId: 'user_14',
        method: 'clerk',
        role: 'manager',
        permissions: ['orders.view', 'reports.view'],
      };

      expect(hasPermission(rbacUser, 'orders.view')).toBe(true);
    });

    it('returns false when user lacks permission', () => {
      const rbacUser: AuthUserWithRbac = {
        userId: 'user_15',
        method: 'clerk',
        role: 'viewer',
        permissions: ['orders.view'],
      };

      expect(hasPermission(rbacUser, 'orders.manage')).toBe(false);
    });

    it('returns false when rbacUser is null', () => {
      expect(hasPermission(null, 'orders.view')).toBe(false);
    });
  });

  describe('hasAnyPermission', () => {
    it('returns true when user has any of the permissions', () => {
      const rbacUser: AuthUserWithRbac = {
        userId: 'user_16',
        method: 'clerk',
        role: 'manager',
        permissions: ['orders.view', 'reports.view'],
      };

      expect(hasAnyPermission(rbacUser, ['orders.manage', 'orders.view'])).toBe(true);
    });

    it('returns false when user has none of the permissions', () => {
      const rbacUser: AuthUserWithRbac = {
        userId: 'user_17',
        method: 'clerk',
        role: 'viewer',
        permissions: ['orders.view'],
      };

      expect(hasAnyPermission(rbacUser, ['products.manage', 'inventory.manage'])).toBe(false);
    });

    it('returns false when rbacUser is null', () => {
      expect(hasAnyPermission(null, ['orders.view'])).toBe(false);
    });

    it('returns false for empty permissions array', () => {
      const rbacUser: AuthUserWithRbac = {
        userId: 'user_18',
        method: 'clerk',
        role: 'viewer',
        permissions: ['orders.view'],
      };

      expect(hasAnyPermission(rbacUser, [])).toBe(false);
    });
  });

  describe('hasAllPermissions', () => {
    it('returns true when user has all permissions', () => {
      const rbacUser: AuthUserWithRbac = {
        userId: 'user_19',
        method: 'clerk',
        role: 'admin',
        permissions: ['orders.view', 'orders.manage', 'reports.view'],
      };

      expect(hasAllPermissions(rbacUser, ['orders.view', 'orders.manage'])).toBe(true);
    });

    it('returns false when user lacks some permissions', () => {
      const rbacUser: AuthUserWithRbac = {
        userId: 'user_20',
        method: 'clerk',
        role: 'manager',
        permissions: ['orders.view', 'reports.view'],
      };

      expect(hasAllPermissions(rbacUser, ['orders.view', 'orders.manage'])).toBe(false);
    });

    it('returns false when rbacUser is null', () => {
      expect(hasAllPermissions(null, ['orders.view'])).toBe(false);
    });

    it('returns true for empty permissions array', () => {
      const rbacUser: AuthUserWithRbac = {
        userId: 'user_21',
        method: 'clerk',
        role: 'viewer',
        permissions: ['orders.view'],
      };

      expect(hasAllPermissions(rbacUser, [])).toBe(true);
    });
  });
});
