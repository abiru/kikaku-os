import { createMiddleware } from 'hono/factory';
import type { Env } from '../env';
import { jsonError } from '../lib/http';
import type { RoleId, AdminUserRow } from '../lib/schemas/rbac';

// Extended AuthUser with RBAC info
export interface AuthUserWithRbac {
  userId: string;
  email?: string;
  method: 'clerk' | 'api-key';
  role: RoleId;
  permissions: string[];
  adminUser?: AdminUserRow;
}

declare module 'hono' {
  interface ContextVariableMap {
    rbacUser: AuthUserWithRbac | null;
  }
}

/**
 * Fetches admin user info and permissions from DB
 */
async function fetchUserPermissions(
  db: D1Database,
  clerkUserId: string
): Promise<{ adminUser: AdminUserRow | null; permissions: string[] }> {
  // Get admin user
  const adminUser = await db
    .prepare('SELECT id, clerk_user_id, email, name, role_id, is_active, last_login_at, created_at, updated_at FROM admin_users WHERE clerk_user_id = ? AND is_active = 1')
    .bind(clerkUserId)
    .first<AdminUserRow>();

  if (!adminUser) {
    return { adminUser: null, permissions: [] };
  }

  // Get permissions for the user's role
  const permissionRows = await db
    .prepare(
      `SELECT p.id FROM permissions p
       JOIN role_permissions rp ON p.id = rp.permission_id
       WHERE rp.role_id = ?`
    )
    .bind(adminUser.role_id)
    .all<{ id: string }>();

  const permissions = permissionRows.results?.map((r) => r.id) || [];

  return { adminUser, permissions };
}

/**
 * Middleware that loads RBAC info for authenticated users.
 * Must be used AFTER clerkAuth middleware.
 */
export const loadRbac = createMiddleware<Env>(async (c, next) => {
  const authUser = c.get('authUser');

  if (!authUser) {
    c.set('rbacUser', null);
    return next();
  }

  // API key users get full admin access
  if (authUser.method === 'api-key') {
    // Fetch all permissions for admin role
    const permissionRows = await c.env.DB.prepare(
      `SELECT p.id FROM permissions p
       JOIN role_permissions rp ON p.id = rp.permission_id
       WHERE rp.role_id = 'admin'`
    ).all<{ id: string }>();

    c.set('rbacUser', {
      ...authUser,
      role: 'admin' as RoleId,
      permissions: permissionRows.results?.map((r) => r.id) || [],
    });
    return next();
  }

  // Clerk users - fetch from DB
  const { adminUser, permissions } = await fetchUserPermissions(
    c.env.DB,
    authUser.userId
  );

  if (!adminUser) {
    // User exists in Clerk but not in admin_users table
    // This could mean they're a new user or not authorized
    c.set('rbacUser', null);
    return next();
  }

  // Update last login
  await c.env.DB.prepare(
    `UPDATE admin_users SET last_login_at = datetime('now') WHERE id = ?`
  ).bind(adminUser.id).run();

  c.set('rbacUser', {
    ...authUser,
    role: adminUser.role_id as RoleId,
    permissions,
    adminUser,
  });

  return next();
});

/**
 * Middleware that requires specific permission(s).
 * Must be used AFTER loadRbac middleware.
 *
 * @param permissions - Single permission or array of permissions (any match = allowed)
 */
export const requirePermission = (...permissions: string[]) =>
  createMiddleware<Env>(async (c, next) => {
    const rbacUser = c.get('rbacUser');

    if (!rbacUser) {
      return jsonError(c, 'Unauthorized - not authenticated or not an admin user', 401);
    }

    const hasPermission = permissions.some((p) =>
      rbacUser.permissions.includes(p)
    );

    if (!hasPermission) {
      return jsonError(
        c,
        `Forbidden - requires one of: ${permissions.join(', ')}`,
        403
      );
    }

    return next();
  });

/**
 * Middleware that requires specific role(s).
 * Must be used AFTER loadRbac middleware.
 *
 * @param roles - Single role or array of roles (any match = allowed)
 */
export const requireRole = (...roles: RoleId[]) =>
  createMiddleware<Env>(async (c, next) => {
    const rbacUser = c.get('rbacUser');

    if (!rbacUser) {
      return jsonError(c, 'Unauthorized - not authenticated or not an admin user', 401);
    }

    if (!roles.includes(rbacUser.role)) {
      return jsonError(
        c,
        `Forbidden - requires one of roles: ${roles.join(', ')}`,
        403
      );
    }

    return next();
  });

/**
 * Middleware that requires minimum role priority.
 * admin (100) > manager (50) > accountant (30) > viewer (10)
 * Must be used AFTER loadRbac middleware.
 *
 * @param minRole - Minimum role required (by priority)
 */
export const requireMinRole = (minRole: RoleId) => {
  const rolePriorities: Record<RoleId, number> = {
    admin: 100,
    manager: 50,
    accountant: 30,
    viewer: 10,
  };

  const minPriority = rolePriorities[minRole];

  return createMiddleware<Env>(async (c, next) => {
    const rbacUser = c.get('rbacUser');

    if (!rbacUser) {
      return jsonError(c, 'Unauthorized - not authenticated or not an admin user', 401);
    }

    const userPriority = rolePriorities[rbacUser.role];

    if (userPriority < minPriority) {
      return jsonError(
        c,
        `Forbidden - requires ${minRole} or higher role`,
        403
      );
    }

    return next();
  });
};

/**
 * Helper to check if user has a specific permission
 */
export const hasPermission = (
  rbacUser: AuthUserWithRbac | null,
  permission: string
): boolean => {
  if (!rbacUser) return false;
  return rbacUser.permissions.includes(permission);
};

/**
 * Helper to check if user has any of the specified permissions
 */
export const hasAnyPermission = (
  rbacUser: AuthUserWithRbac | null,
  permissions: string[]
): boolean => {
  if (!rbacUser) return false;
  return permissions.some((p) => rbacUser.permissions.includes(p));
};

/**
 * Helper to check if user has all specified permissions
 */
export const hasAllPermissions = (
  rbacUser: AuthUserWithRbac | null,
  permissions: string[]
): boolean => {
  if (!rbacUser) return false;
  return permissions.every((p) => rbacUser.permissions.includes(p));
};
