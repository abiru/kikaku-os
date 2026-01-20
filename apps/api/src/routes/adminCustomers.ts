import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { Env } from '../env';
import { jsonOk, jsonError } from '../lib/http';
import {
  customerIdParamSchema,
  customerListQuerySchema,
  createCustomerSchema,
  updateCustomerSchema,
} from '../lib/schemas';

const app = new Hono<Env>();

// Custom error handler for zod validation (zod v4 compatible)
const validationErrorHandler = (result: { success: boolean; error?: { issues: Array<{ message: string }> } }, c: any) => {
  if (!result.success) {
    const messages = result.error?.issues.map((e) => e.message).join(', ') || 'Validation failed';
    return c.json({ ok: false, message: messages }, 400);
  }
};

// GET /customers - List customers with pagination and search
app.get(
  '/customers',
  zValidator('query', customerListQuerySchema, validationErrorHandler),
  async (c) => {
    const { q, page, perPage } = c.req.valid('query');
    const offset = (page - 1) * perPage;

    try {
      let whereClause = '';
      const bindings: (string | number)[] = [];

      if (q) {
        whereClause = 'WHERE name LIKE ? OR email LIKE ?';
        bindings.push(`%${q}%`, `%${q}%`);
      }

      const countQuery = `SELECT COUNT(*) as count FROM customers ${whereClause}`;
      const countRes = await c.env.DB.prepare(countQuery).bind(...bindings).first<{ count: number }>();
      const totalCount = countRes?.count || 0;

      const dataQuery = `
        SELECT id, name, email, metadata, created_at, updated_at
        FROM customers
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;
      bindings.push(perPage, offset);

      const customers = await c.env.DB.prepare(dataQuery).bind(...bindings).all();

      // Audit Log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(
        'admin',
        'view_customers',
        'admin_customers_list',
        JSON.stringify({ q, page, perPage, count: customers.results.length })
      ).run();

      return jsonOk(c, {
        customers: customers.results,
        meta: {
          page,
          perPage,
          totalCount,
          totalPages: Math.ceil(totalCount / perPage)
        }
      });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to fetch customers');
    }
  }
);

// GET /customers/:id - Fetch single customer
app.get(
  '/customers/:id',
  zValidator('param', customerIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      const customer = await c.env.DB.prepare(`
        SELECT id, name, email, metadata, created_at, updated_at
        FROM customers
        WHERE id = ?
      `).bind(id).first();

      if (!customer) {
        return jsonError(c, 'Customer not found', 404);
      }

      // Audit Log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind('admin', 'view_customer', `customer:${id}`, JSON.stringify({ customer_id: id })).run();

      return jsonOk(c, { customer });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to fetch customer');
    }
  }
);

// POST /customers - Create customer
app.post(
  '/customers',
  zValidator('json', createCustomerSchema, validationErrorHandler),
  async (c) => {
    const { name, email, metadata } = c.req.valid('json');

    try {
      const result = await c.env.DB.prepare(`
        INSERT INTO customers (name, email, metadata, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
      `).bind(name, email, metadata ? JSON.stringify(metadata) : null).run();

      const customerId = result.meta.last_row_id;

      // Fetch created customer
      const customer = await c.env.DB.prepare(`
        SELECT id, name, email, metadata, created_at, updated_at
        FROM customers WHERE id = ?
      `).bind(customerId).first();

      // Audit Log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind('admin', 'create_customer', `customer:${customerId}`, JSON.stringify({ name, email })).run();

      return jsonOk(c, { customer });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to create customer');
    }
  }
);

// PUT /customers/:id - Update customer
app.put(
  '/customers/:id',
  zValidator('param', customerIdParamSchema, validationErrorHandler),
  zValidator('json', updateCustomerSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');
    const { name, email, metadata } = c.req.valid('json');

    try {
      // Check exists
      const existing = await c.env.DB.prepare(
        'SELECT id, name, email, metadata FROM customers WHERE id = ?'
      ).bind(id).first<{ id: number; name: string; email: string | null; metadata: string | null }>();

      if (!existing) {
        return jsonError(c, 'Customer not found', 404);
      }

      // Build update query dynamically based on provided fields
      const updates: string[] = [];
      const values: (string | null)[] = [];

      if (name !== undefined) {
        updates.push('name = ?');
        values.push(name);
      }
      if (email !== undefined) {
        updates.push('email = ?');
        values.push(email);
      }
      if (metadata !== undefined) {
        updates.push('metadata = ?');
        values.push(metadata ? JSON.stringify(metadata) : null);
      }

      if (updates.length === 0) {
        return jsonError(c, 'No fields to update', 400);
      }

      updates.push("updated_at = datetime('now')");
      values.push(String(id));

      await c.env.DB.prepare(`
        UPDATE customers
        SET ${updates.join(', ')}
        WHERE id = ?
      `).bind(...values).run();

      // Fetch updated customer
      const customer = await c.env.DB.prepare(`
        SELECT id, name, email, metadata, created_at, updated_at
        FROM customers WHERE id = ?
      `).bind(id).first();

      // Audit Log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind('admin', 'update_customer', `customer:${id}`, JSON.stringify({ name, email })).run();

      return jsonOk(c, { customer });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to update customer');
    }
  }
);

// DELETE /customers/:id - Delete customer
app.delete(
  '/customers/:id',
  zValidator('param', customerIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      // Check exists
      const existing = await c.env.DB.prepare(
        'SELECT id, name FROM customers WHERE id = ?'
      ).bind(id).first<{ id: number; name: string }>();

      if (!existing) {
        return jsonError(c, 'Customer not found', 404);
      }

      // Check for related orders
      const orderCount = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM orders WHERE customer_id = ?'
      ).bind(id).first<{ count: number }>();

      if (orderCount && orderCount.count > 0) {
        return jsonError(c, `Cannot delete customer with ${orderCount.count} existing order(s)`, 400);
      }

      // Delete customer
      await c.env.DB.prepare('DELETE FROM customers WHERE id = ?').bind(id).run();

      // Audit Log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind('admin', 'delete_customer', `customer:${id}`, JSON.stringify({ name: existing.name })).run();

      return jsonOk(c, { deleted: true });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to delete customer');
    }
  }
);

export default app;
