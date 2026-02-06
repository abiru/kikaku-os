import { describe, it, expect } from 'vitest';
import worker from '../../../index';

type AdminUserRow = {
  id: number;
  clerk_user_id: string;
  email: string;
  name: string | null;
  role_id: string;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  role_name?: string;
  role_priority?: number;
};

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  created_at: string;
  updated_at: string;
};

type PermissionRow = {
  id: string;
  name: string;
  resource: string;
  action: string;
  description: string | null;
};

const createMockEnv = () => {
  const calls: { sql: string; bind: unknown[] }[] = [];

  // Seed roles
  const roles: RoleRow[] = [
    { id: 'admin', name: 'Administrator', description: 'Full access', priority: 100, created_at: '2024-01-01', updated_at: '2024-01-01' },
    { id: 'manager', name: 'Manager', description: 'Manage operations', priority: 50, created_at: '2024-01-01', updated_at: '2024-01-01' },
    { id: 'accountant', name: 'Accountant', description: 'Financial access', priority: 30, created_at: '2024-01-01', updated_at: '2024-01-01' },
    { id: 'viewer', name: 'Viewer', description: 'Read-only', priority: 10, created_at: '2024-01-01', updated_at: '2024-01-01' },
  ];

  // Seed permissions for admin role (all permissions for API key auth)
  const adminPermissions: PermissionRow[] = [
    { id: 'dashboard:read', name: 'View Dashboard', resource: 'dashboard', action: 'read', description: null },
    { id: 'users:read', name: 'View Users', resource: 'users', action: 'read', description: null },
    { id: 'users:write', name: 'Manage Users', resource: 'users', action: 'write', description: null },
    { id: 'users:delete', name: 'Delete Users', resource: 'users', action: 'delete', description: null },
    { id: 'orders:read', name: 'View Orders', resource: 'orders', action: 'read', description: null },
  ];

  let adminUsers: AdminUserRow[] = [
    {
      id: 1,
      clerk_user_id: 'user_admin123',
      email: 'admin@example.com',
      name: 'Admin User',
      role_id: 'admin',
      is_active: 1,
      last_login_at: '2024-01-01 10:00:00',
      created_at: '2024-01-01 00:00:00',
      updated_at: '2024-01-01 00:00:00',
    },
    {
      id: 2,
      clerk_user_id: 'user_viewer456',
      email: 'viewer@example.com',
      name: 'Viewer User',
      role_id: 'viewer',
      is_active: 1,
      last_login_at: null,
      created_at: '2024-01-02 00:00:00',
      updated_at: '2024-01-02 00:00:00',
    },
  ];
  let nextId = 3;

  return {
    calls,
    DB: {
      prepare: (sql: string) => {
        // Helper to create query result handlers
        const createHandlers = (args: unknown[]) => ({
          first: async <T>() => {
            calls.push({ sql, bind: args });

            // Count queries
            if (sql.includes('COUNT(*)') && sql.includes('admin_users')) {
              return { count: adminUsers.length } as T;
            }

            // Fetch admin user by clerk_user_id (for RBAC middleware)
            if (sql.includes('FROM admin_users') && sql.includes('WHERE clerk_user_id') && sql.includes('is_active')) {
              const clerkId = args[0] as string;
              const user = adminUsers.find((u) => u.clerk_user_id === clerkId && u.is_active === 1);
              return user as T | undefined;
            }

            // Fetch admin user by clerk_user_id (general)
            if (sql.includes('FROM admin_users') && sql.includes('WHERE clerk_user_id')) {
              const clerkId = args[0] as string;
              const user = adminUsers.find((u) => u.clerk_user_id === clerkId);
              return user as T | undefined;
            }

            // Fetch admin user by id with JOIN
            if (sql.includes('FROM admin_users') && sql.includes('JOIN roles') && sql.includes('WHERE u.id')) {
              const id = args[0] as number;
              const user = adminUsers.find((u) => u.id === id);
              if (user) {
                const role = roles.find(r => r.id === user.role_id);
                return {
                  ...user,
                  role_name: role?.name,
                  role_priority: role?.priority,
                } as T;
              }
              return undefined;
            }

            // Fetch admin user by id (simple)
            if (sql.includes('FROM admin_users') && sql.includes('WHERE id')) {
              const id = args[0] as number;
              const user = adminUsers.find((u) => u.id === id);
              if (user) {
                const role = roles.find(r => r.id === user.role_id);
                return {
                  ...user,
                  role_name: role?.name,
                  role_priority: role?.priority,
                } as T;
              }
              return undefined;
            }

            // Fetch admin user by email with exclusion (for update)
            if (sql.includes('FROM admin_users') && sql.includes('WHERE email') && sql.includes('AND id !=')) {
              const email = args[0] as string;
              const excludeId = args[1] as number;
              const user = adminUsers.find((u) => u.email === email && u.id !== excludeId);
              return user as T | undefined;
            }

            // Fetch admin user by email
            if (sql.includes('FROM admin_users') && sql.includes('WHERE email')) {
              const email = args[0] as string;
              const user = adminUsers.find((u) => u.email === email);
              return user as T | undefined;
            }

            // Fetch role by id
            if (sql.includes('FROM roles') && sql.includes('WHERE id')) {
              const roleId = args[0] as string;
              const role = roles.find((r) => r.id === roleId);
              return role as T | undefined;
            }

            return undefined;
          },
          all: async <T>() => {
            calls.push({ sql, bind: args });

            // Roles list
            if (sql.includes('FROM roles') && !sql.includes('role_permissions')) {
              return { results: roles } as T;
            }

            // Admin users list
            if (sql.includes('FROM admin_users')) {
              const usersWithRoles = adminUsers.map((u) => {
                const role = roles.find(r => r.id === u.role_id);
                return {
                  ...u,
                  role_name: role?.name,
                  role_priority: role?.priority,
                };
              });
              return { results: usersWithRoles } as T;
            }

            // Permissions for admin role (used by RBAC middleware for API key auth)
            if (sql.includes('FROM permissions') && sql.includes('role_permissions')) {
              // Check if it's querying for admin role specifically (no bind args, hardcoded 'admin' in SQL)
              if (sql.includes("= 'admin'") || args[0] === 'admin') {
                return { results: adminPermissions } as T;
              }
              const roleId = args[0] as string;
              // Other roles get fewer permissions
              if (roleId === 'viewer') {
                return { results: adminPermissions.slice(0, 2) } as T;
              }
              return { results: adminPermissions.slice(0, 4) } as T;
            }

            return { results: [] } as T;
          },
          run: async () => {
            calls.push({ sql, bind: args });

            // Insert admin user
            if (sql.includes('INSERT INTO admin_users')) {
              const newUser: AdminUserRow = {
                id: nextId++,
                clerk_user_id: args[0] as string,
                email: args[1] as string,
                name: args[2] as string | null,
                role_id: args[3] as string,
                is_active: 1,
                last_login_at: null,
                created_at: '2024-01-03 00:00:00',
                updated_at: '2024-01-03 00:00:00',
              };
              adminUsers.push(newUser);
              return { meta: { last_row_id: newUser.id } };
            }

            // Update admin user
            if (sql.includes('UPDATE admin_users')) {
              return { meta: {} };
            }

            // Delete admin user
            if (sql.includes('DELETE FROM admin_users')) {
              const id = args[args.length - 1] as number;
              adminUsers = adminUsers.filter((u) => u.id !== id);
              return { meta: {} };
            }

            // Audit log insert
            if (sql.includes('INSERT INTO audit_logs')) {
              return { meta: {} };
            }

            return { meta: {} };
          },
        });

        // Return an object that supports both .bind().method() and .method() directly
        return {
          bind: (...args: unknown[]) => createHandlers(args),
          // Direct method calls (no bind)
          first: async <T>() => createHandlers([]).first<T>(),
          all: async <T>() => createHandlers([]).all<T>(),
          run: async () => createHandlers([]).run(),
        };
      },
    },
    ADMIN_API_KEY: 'test-admin-key',
  };
};

const createExecutionContext = () => ({
  waitUntil: () => {},
  passThroughOnException: () => {},
});

describe('GET /admin/roles', () => {
  it('returns role list', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/roles', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' },
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(json.roles).toBeDefined();
    expect(json.roles.length).toBe(4);
  });

  it('returns 401 without auth header', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/roles', {
        method: 'GET',
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(401);
  });
});

describe('GET /admin/users', () => {
  it('returns admin user list with pagination', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/users', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' },
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(json.users).toBeDefined();
    expect(json.meta).toBeDefined();
    expect(json.meta.page).toBe(1);
    expect(json.meta.perPage).toBe(20);
  });

  it('returns 401 without auth header', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/users', {
        method: 'GET',
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(401);
  });
});

describe('GET /admin/users/:id', () => {
  it('returns admin user detail with permissions', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/users/1', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' },
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(json.user).toBeDefined();
    expect(json.user.id).toBe(1);
    expect(json.user.email).toBe('admin@example.com');
    expect(json.permissions).toBeDefined();
  });

  it('returns 404 for non-existent user', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/users/999', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' },
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(404);
    const json = await res.json<any>();
    expect(json.ok).toBe(false);
    expect(json.message).toBe('Admin user not found');
  });

  it('returns 400 for invalid ID', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/users/abc', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' },
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(400);
  });
});

describe('POST /admin/users', () => {
  it('creates a new admin user', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/users', {
        method: 'POST',
        headers: {
          'x-admin-key': 'test-admin-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clerk_user_id: 'user_new789',
          email: 'newuser@example.com',
          name: 'New User',
          role_id: 'manager',
        }),
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(json.user).toBeDefined();
    expect(mockEnv.calls.some((call) => call.sql.includes('INSERT INTO admin_users'))).toBe(true);
  });

  it('creates user with default viewer role', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/users', {
        method: 'POST',
        headers: {
          'x-admin-key': 'test-admin-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clerk_user_id: 'user_default123',
          email: 'default@example.com',
        }),
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
  });

  it('returns 400 for missing clerk_user_id', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/users', {
        method: 'POST',
        headers: {
          'x-admin-key': 'test-admin-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'noclerk@example.com',
        }),
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(400);
    const json = await res.json<any>();
    expect(json.ok).toBe(false);
  });

  it('returns 400 for missing email', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/users', {
        method: 'POST',
        headers: {
          'x-admin-key': 'test-admin-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clerk_user_id: 'user_noemail123',
        }),
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(400);
    const json = await res.json<any>();
    expect(json.ok).toBe(false);
  });

  it('returns 400 for invalid email', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/users', {
        method: 'POST',
        headers: {
          'x-admin-key': 'test-admin-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clerk_user_id: 'user_invalidemail',
          email: 'not-an-email',
        }),
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(400);
    const json = await res.json<any>();
    expect(json.ok).toBe(false);
  });

  it('returns 400 for invalid role', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/users', {
        method: 'POST',
        headers: {
          'x-admin-key': 'test-admin-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clerk_user_id: 'user_invalidrole',
          email: 'invalidrole@example.com',
          role_id: 'superadmin',
        }),
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(400);
    const json = await res.json<any>();
    expect(json.ok).toBe(false);
  });
});

describe('PUT /admin/users/:id', () => {
  it('updates admin user', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/users/2', {
        method: 'PUT',
        headers: {
          'x-admin-key': 'test-admin-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Updated Viewer Name',
          role_id: 'manager',
        }),
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(mockEnv.calls.some((call) => call.sql.includes('UPDATE admin_users'))).toBe(true);
  });

  it('returns 404 for non-existent user', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/users/999', {
        method: 'PUT',
        headers: {
          'x-admin-key': 'test-admin-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Does Not Exist',
        }),
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(404);
    const json = await res.json<any>();
    expect(json.ok).toBe(false);
    expect(json.message).toBe('Admin user not found');
  });
});

describe('DELETE /admin/users/:id', () => {
  it('deletes admin user', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/users/2', {
        method: 'DELETE',
        headers: { 'x-admin-key': 'test-admin-key' },
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(json.deleted).toBe(true);
    expect(mockEnv.calls.some((call) => call.sql.includes('DELETE FROM admin_users'))).toBe(true);
  });

  it('returns 404 for non-existent user', async () => {
    const mockEnv = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/users/999', {
        method: 'DELETE',
        headers: { 'x-admin-key': 'test-admin-key' },
      }),
      mockEnv as any,
      createExecutionContext() as any
    );

    expect(res.status).toBe(404);
    const json = await res.json<any>();
    expect(json.ok).toBe(false);
    expect(json.message).toBe('Admin user not found');
  });
});
