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

  const rolePermissions: Record<string, string[]> = {
    admin: ['orders:read', 'orders:write', 'products:write', 'reports:read'],
    manager: ['orders:read', 'reports:read'],
    accountant: ['reports:read'],
    viewer: ['orders:read'],
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
        permissions: expect.arrayContaining(['orders:read', 'orders:write', 'products:write']),
      });
    });

    it('handles empty permissions for API key user', async () => {
      // Create environment with no permissions for admin role
      const calls: { sql: string; bind: unknown[] }[] = [];

      const emptyDB = {
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

      const env = { ...createMockEnv().env, DB: emptyDB };

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
        permissions: ['orders:read', 'reports:read'],
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
    const app = createApp(['orders:read']);
    const rbacUser: AuthUserWithRbac = {
      userId: 'user_1',
      method: 'clerk',
      role: 'manager',
      permissions: ['orders:read', 'reports:read'],
    };

    const res = await app.request('/protected', {
      headers: {
        'x-mock-rbac': JSON.stringify(rbacUser),
      },
    });

    expect(res.status).toBe(200);
  });

  it('allows access when user has any of multiple required permissions', async () => {
    const app = createApp(['orders:write', 'orders:read']);
    const rbacUser: AuthUserWithRbac = {
      userId: 'user_2',
      method: 'clerk',
      role: 'viewer',
      permissions: ['orders:read'], // Has one of the required permissions
    };

    const res = await app.request('/protected', {
      headers: {
        'x-mock-rbac': JSON.stringify(rbacUser),
      },
    });

    expect(res.status).toBe(200);
  });

  it('denies access without required permission', async () => {
    const app = createApp(['orders:write']);
    const rbacUser: AuthUserWithRbac = {
      userId: 'user_3',
      method: 'clerk',
      role: 'viewer',
      permissions: ['orders:read'], // Missing orders:write
    };

    const res = await app.request('/protected', {
      headers: {
        'x-mock-rbac': JSON.stringify(rbacUser),
      },
    });

    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.message).toContain('Forbidden');
    expect(body.message).toContain('orders:write');
  });

  it('denies access when rbacUser is null', async () => {
    const app = createApp(['orders:read']);

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
    const app = createApp(['products:write', 'inventory:write', 'orders:write']);
    const rbacUser: AuthUserWithRbac = {
      userId: 'user_4',
      method: 'clerk',
      role: 'manager',
      permissions: ['inventory:write', 'reports:read'], // Has one required permission
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
      permissions: ['orders:read'],
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
      permissions: ['orders:read'],
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
        permissions: ['orders:read', 'reports:read'],
      };

      expect(hasPermission(rbacUser, 'orders:read')).toBe(true);
    });

    it('returns false when user lacks permission', () => {
      const rbacUser: AuthUserWithRbac = {
        userId: 'user_15',
        method: 'clerk',
        role: 'viewer',
        permissions: ['orders:read'],
      };

      expect(hasPermission(rbacUser, 'orders:write')).toBe(false);
    });

    it('returns false when rbacUser is null', () => {
      expect(hasPermission(null, 'orders:read')).toBe(false);
    });
  });

  describe('hasAnyPermission', () => {
    it('returns true when user has any of the permissions', () => {
      const rbacUser: AuthUserWithRbac = {
        userId: 'user_16',
        method: 'clerk',
        role: 'manager',
        permissions: ['orders:read', 'reports:read'],
      };

      expect(hasAnyPermission(rbacUser, ['orders:write', 'orders:read'])).toBe(true);
    });

    it('returns false when user has none of the permissions', () => {
      const rbacUser: AuthUserWithRbac = {
        userId: 'user_17',
        method: 'clerk',
        role: 'viewer',
        permissions: ['orders:read'],
      };

      expect(hasAnyPermission(rbacUser, ['products:write', 'inventory:write'])).toBe(false);
    });

    it('returns false when rbacUser is null', () => {
      expect(hasAnyPermission(null, ['orders:read'])).toBe(false);
    });

    it('returns false for empty permissions array', () => {
      const rbacUser: AuthUserWithRbac = {
        userId: 'user_18',
        method: 'clerk',
        role: 'viewer',
        permissions: ['orders:read'],
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
        permissions: ['orders:read', 'orders:write', 'reports:read'],
      };

      expect(hasAllPermissions(rbacUser, ['orders:read', 'orders:write'])).toBe(true);
    });

    it('returns false when user lacks some permissions', () => {
      const rbacUser: AuthUserWithRbac = {
        userId: 'user_20',
        method: 'clerk',
        role: 'manager',
        permissions: ['orders:read', 'reports:read'],
      };

      expect(hasAllPermissions(rbacUser, ['orders:read', 'orders:write'])).toBe(false);
    });

    it('returns false when rbacUser is null', () => {
      expect(hasAllPermissions(null, ['orders:read'])).toBe(false);
    });

    it('returns true for empty permissions array', () => {
      const rbacUser: AuthUserWithRbac = {
        userId: 'user_21',
        method: 'clerk',
        role: 'viewer',
        permissions: ['orders:read'],
      };

      expect(hasAllPermissions(rbacUser, [])).toBe(true);
    });
  });
});
