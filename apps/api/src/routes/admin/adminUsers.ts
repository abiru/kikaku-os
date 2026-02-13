import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { Env } from '../../env';
import { jsonOk, jsonError } from '../../lib/http';
import { getActor } from '../../middleware/clerkAuth';
import { loadRbac, requirePermission } from '../../middleware/rbac';
import { validationErrorHandler } from '../../lib/validation';
import {
  adminUserIdParamSchema,
  adminUserListQuerySchema,
  createAdminUserSchema,
  updateAdminUserSchema,
  PERMISSIONS,
  AdminUserRow,
  AdminUserWithRole,
  RoleRow,
} from '../../lib/schemas';

const app = new Hono<Env>();

// Apply RBAC middleware to all routes in this file
app.use('*', loadRbac);

// GET /admin/users/me - Get current user info
app.get('/users/me', async (c) => {
  const rbacUser = c.get('rbacUser');

  if (!rbacUser) {
    return jsonError(c, 'Not authenticated or not an admin user', 401);
  }

  // Fetch full user info
  const user = await c.env.DB.prepare(`
    SELECT
      u.id,
      u.clerk_user_id,
      u.email,
      u.name,
      u.role_id,
      u.is_active,
      u.last_login_at,
      u.created_at,
      u.updated_at,
      r.name as role_name,
      r.priority as role_priority
    FROM admin_users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.clerk_user_id = ?
  `).bind(rbacUser.userId).first<AdminUserWithRole>();

  return jsonOk(c, {
    user,
    role: rbacUser.role,
    permissions: rbacUser.permissions,
  });
});

// GET /admin/roles - List all roles
app.get('/roles', requirePermission(PERMISSIONS.USERS_READ), async (c) => {
  const roles = await c.env.DB.prepare(`
    SELECT id, name, description, priority, created_at, updated_at
    FROM roles
    ORDER BY priority DESC
  `).all<RoleRow>();

  return jsonOk(c, { roles: roles.results || [] });
});

// GET /admin/roles/:roleId/permissions - Get permissions for a role
app.get('/roles/:roleId/permissions', requirePermission(PERMISSIONS.USERS_READ), async (c) => {
  const roleId = c.req.param('roleId');

  const permissions = await c.env.DB.prepare(`
    SELECT p.id, p.name, p.resource, p.action, p.description
    FROM permissions p
    JOIN role_permissions rp ON p.id = rp.permission_id
    WHERE rp.role_id = ?
    ORDER BY p.resource, p.action
  `).bind(roleId).all<{ id: string; name: string; resource: string; action: string; description: string | null }>();

  return jsonOk(c, { permissions: permissions.results || [] });
});

// GET /admin/users - List admin users with pagination and search
app.get(
  '/users',
  requirePermission(PERMISSIONS.USERS_READ),
  zValidator('query', adminUserListQuerySchema, validationErrorHandler),
  async (c) => {
    const { q, role, active, page, perPage } = c.req.valid('query');
    const offset = (page - 1) * perPage;

    const conditions: string[] = [];
    const bindings: (string | number)[] = [];

    if (q) {
      conditions.push('(u.name LIKE ? OR u.email LIKE ?)');
      bindings.push(`%${q}%`, `%${q}%`);
    }

    if (role) {
      conditions.push('u.role_id = ?');
      bindings.push(role);
    }

    if (active !== 'all') {
      conditions.push('u.is_active = ?');
      bindings.push(active === 'true' ? 1 : 0);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count query
    const countQuery = `SELECT COUNT(*) as count FROM admin_users u ${whereClause}`;
    const countRes = await c.env.DB.prepare(countQuery).bind(...bindings).first<{ count: number }>();
    const totalCount = countRes?.count || 0;

    // Data query
    const dataQuery = `
      SELECT
        u.id,
        u.clerk_user_id,
        u.email,
        u.name,
        u.role_id,
        u.is_active,
        u.last_login_at,
        u.created_at,
        u.updated_at,
        r.name as role_name,
        r.priority as role_priority
      FROM admin_users u
      JOIN roles r ON u.role_id = r.id
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const dataBindings = [...bindings, perPage, offset];
    const users = await c.env.DB.prepare(dataQuery).bind(...dataBindings).all<AdminUserWithRole>();

    // Audit Log
    await c.env.DB.prepare(
      'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
    ).bind(
      getActor(c),
      'view_admin_users',
      'admin_users_list',
      JSON.stringify({ q, role, active, page, perPage, count: users.results?.length || 0 })
    ).run();

    return jsonOk(c, {
      users: users.results || [],
      meta: {
        page,
        perPage,
        totalCount,
        totalPages: Math.ceil(totalCount / perPage),
      },
    });
  }
);

// GET /admin/users/:id - Get single admin user
app.get(
  '/users/:id',
  requirePermission(PERMISSIONS.USERS_READ),
  zValidator('param', adminUserIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    const user = await c.env.DB.prepare(`
      SELECT
        u.id,
        u.clerk_user_id,
        u.email,
        u.name,
        u.role_id,
        u.is_active,
        u.last_login_at,
        u.created_at,
        u.updated_at,
        r.name as role_name,
        r.priority as role_priority
      FROM admin_users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = ?
    `).bind(id).first<AdminUserWithRole>();

    if (!user) {
      return jsonError(c, 'Admin user not found', 404);
    }

    // Get user's permissions
    const permissions = await c.env.DB.prepare(`
      SELECT p.id, p.name, p.resource, p.action
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = ?
      ORDER BY p.resource, p.action
    `).bind(user.role_id).all<{ id: string; name: string; resource: string; action: string }>();

    // Audit Log
    await c.env.DB.prepare(
      'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
    ).bind(getActor(c), 'view_admin_user', `admin_user:${id}`, JSON.stringify({ user_id: id })).run();

    return jsonOk(c, {
      user,
      permissions: permissions.results || [],
    });
  }
);

// POST /admin/users - Create admin user
app.post(
  '/users',
  requirePermission(PERMISSIONS.USERS_WRITE),
  zValidator('json', createAdminUserSchema, validationErrorHandler),
  async (c) => {
    const { clerk_user_id, email, name, role_id } = c.req.valid('json');

    // Check if clerk_user_id already exists
    const existing = await c.env.DB.prepare(
      'SELECT id FROM admin_users WHERE clerk_user_id = ?'
    ).bind(clerk_user_id).first();

    if (existing) {
      return jsonError(c, 'User with this Clerk ID already exists', 409);
    }

    // Check if email already exists
    const existingEmail = await c.env.DB.prepare(
      'SELECT id FROM admin_users WHERE email = ?'
    ).bind(email).first();

    if (existingEmail) {
      return jsonError(c, 'User with this email already exists', 409);
    }

    // Verify role exists
    const roleExists = await c.env.DB.prepare(
      'SELECT id FROM roles WHERE id = ?'
    ).bind(role_id).first();

    if (!roleExists) {
      return jsonError(c, 'Invalid role', 400);
    }

    // Insert user
    const result = await c.env.DB.prepare(`
      INSERT INTO admin_users (clerk_user_id, email, name, role_id, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `).bind(clerk_user_id, email, name, role_id).run();

    const userId = result.meta.last_row_id;

    // Fetch created user
    const user = await c.env.DB.prepare(`
      SELECT
        u.id,
        u.clerk_user_id,
        u.email,
        u.name,
        u.role_id,
        u.is_active,
        u.last_login_at,
        u.created_at,
        u.updated_at,
        r.name as role_name,
        r.priority as role_priority
      FROM admin_users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = ?
    `).bind(userId).first<AdminUserWithRole>();

    // Audit Log
    await c.env.DB.prepare(
      'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
    ).bind(
      getActor(c),
      'create_admin_user',
      `admin_user:${userId}`,
      JSON.stringify({ clerk_user_id, email, role_id })
    ).run();

    return jsonOk(c, { user });
  }
);

// PUT /admin/users/:id - Update admin user
app.put(
  '/users/:id',
  requirePermission(PERMISSIONS.USERS_WRITE),
  zValidator('param', adminUserIdParamSchema, validationErrorHandler),
  zValidator('json', updateAdminUserSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');
    const updates = c.req.valid('json');
    const rbacUser = c.get('rbacUser');

    // Check exists
    const existing = await c.env.DB.prepare(
      'SELECT id, clerk_user_id, role_id FROM admin_users WHERE id = ?'
    ).bind(id).first<{ id: number; clerk_user_id: string; role_id: string }>();

    if (!existing) {
      return jsonError(c, 'Admin user not found', 404);
    }

    // Prevent self-demotion (admin can't change their own role)
    if (rbacUser && existing.clerk_user_id === rbacUser.userId && updates.role_id && updates.role_id !== existing.role_id) {
      return jsonError(c, 'Cannot change your own role', 403);
    }

    // Prevent deactivating self
    if (rbacUser && existing.clerk_user_id === rbacUser.userId && updates.is_active === false) {
      return jsonError(c, 'Cannot deactivate your own account', 403);
    }

    // Check if email is being changed and already exists
    if (updates.email) {
      const emailExists = await c.env.DB.prepare(
        'SELECT id FROM admin_users WHERE email = ? AND id != ?'
      ).bind(updates.email, id).first();

      if (emailExists) {
        return jsonError(c, 'User with this email already exists', 409);
      }
    }

    // Verify role exists if being updated
    if (updates.role_id) {
      const roleExists = await c.env.DB.prepare(
        'SELECT id FROM roles WHERE id = ?'
      ).bind(updates.role_id).first();

      if (!roleExists) {
        return jsonError(c, 'Invalid role', 400);
      }
    }

    // Build update query dynamically
    const setClauses: string[] = ["updated_at = datetime('now')"];
    const values: (string | number | null)[] = [];

    if (updates.email !== undefined) {
      setClauses.push('email = ?');
      values.push(updates.email);
    }
    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      values.push(updates.name);
    }
    if (updates.role_id !== undefined) {
      setClauses.push('role_id = ?');
      values.push(updates.role_id);
    }
    if (updates.is_active !== undefined) {
      setClauses.push('is_active = ?');
      values.push(updates.is_active ? 1 : 0);
    }

    values.push(id);

    await c.env.DB.prepare(
      `UPDATE admin_users SET ${setClauses.join(', ')} WHERE id = ?`
    ).bind(...values).run();

    // Fetch updated user
    const user = await c.env.DB.prepare(`
      SELECT
        u.id,
        u.clerk_user_id,
        u.email,
        u.name,
        u.role_id,
        u.is_active,
        u.last_login_at,
        u.created_at,
        u.updated_at,
        r.name as role_name,
        r.priority as role_priority
      FROM admin_users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = ?
    `).bind(id).first<AdminUserWithRole>();

    // Audit Log
    await c.env.DB.prepare(
      'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
    ).bind(
      getActor(c),
      'update_admin_user',
      `admin_user:${id}`,
      JSON.stringify(updates)
    ).run();

    return jsonOk(c, { user });
  }
);

// DELETE /admin/users/:id - Delete admin user
app.delete(
  '/users/:id',
  requirePermission(PERMISSIONS.USERS_DELETE),
  zValidator('param', adminUserIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');
    const rbacUser = c.get('rbacUser');

    // Check exists
    const existing = await c.env.DB.prepare(
      'SELECT id, clerk_user_id, email, name FROM admin_users WHERE id = ?'
    ).bind(id).first<{ id: number; clerk_user_id: string; email: string; name: string | null }>();

    if (!existing) {
      return jsonError(c, 'Admin user not found', 404);
    }

    // Prevent self-deletion
    if (rbacUser && existing.clerk_user_id === rbacUser.userId) {
      return jsonError(c, 'Cannot delete your own account', 403);
    }

    // Delete user
    await c.env.DB.prepare('DELETE FROM admin_users WHERE id = ?').bind(id).run();

    // Audit Log
    await c.env.DB.prepare(
      'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
    ).bind(
      getActor(c),
      'delete_admin_user',
      `admin_user:${id}`,
      JSON.stringify({ email: existing.email, name: existing.name })
    ).run();

    return jsonOk(c, { deleted: true });
  }
);

export default app;
