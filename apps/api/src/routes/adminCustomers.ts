import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { Env } from '../env';
import { jsonOk, jsonError } from '../lib/http';
import {
  customerListQuerySchema,
  customerIdParamSchema,
  createCustomerSchema,
  updateCustomerSchema,
} from '../lib/schemas';

const app = new Hono<Env>();

// Custom error handler for zod validation
const validationErrorHandler = (result: { success: boolean; error?: { issues: Array<{ message: string }> } }, c: any) => {
  if (!result.success) {
    const messages = result.error?.issues.map((e) => e.message).join(', ') || 'Validation failed';
    return c.json({ ok: false, message: messages }, 400);
  }
};

type CustomerRow = {
  id: number;
  name: string;
  email: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
  order_count?: number;
  total_spent?: number;
  last_order_date?: string | null;
};

type OrderRow = {
  id: number;
  status: string;
  total_net: number;
  currency: string;
  created_at: string;
  paid_at: string | null;
};

type CustomerStats = {
  total_orders: number;
  total_spent: number;
  avg_order_value: number;
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
        whereClause = 'WHERE c.name LIKE ? OR c.email LIKE ?';
        bindings.push(`%${q}%`, `%${q}%`);
      }

      // Count query
      const countQuery = `SELECT COUNT(*) as count FROM customers c ${whereClause}`;
      const countRes = await c.env.DB.prepare(countQuery).bind(...bindings).first<{ count: number }>();
      const totalCount = countRes?.count || 0;

      // Data query with order aggregation
      const dataQuery = `
        SELECT
          c.id,
          c.name,
          c.email,
          c.metadata,
          c.created_at,
          c.updated_at,
          COUNT(o.id) as order_count,
          COALESCE(SUM(o.total_net), 0) as total_spent,
          MAX(o.created_at) as last_order_date
        FROM customers c
        LEFT JOIN orders o ON o.customer_id = c.id
        ${whereClause}
        GROUP BY c.id
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?
      `;
      const dataBindings = [...bindings, perPage, offset];

      const customers = await c.env.DB.prepare(dataQuery).bind(...dataBindings).all<CustomerRow>();

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

// GET /customers/:id - Fetch single customer with order history
app.get(
  '/customers/:id',
  zValidator('param', customerIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      // Fetch customer
      const customer = await c.env.DB.prepare(`
        SELECT id, name, email, metadata, created_at, updated_at
        FROM customers
        WHERE id = ?
      `).bind(id).first<CustomerRow>();

      if (!customer) {
        return jsonError(c, 'Customer not found', 404);
      }

      // Fetch order history
      const ordersResult = await c.env.DB.prepare(`
        SELECT id, status, total_net, currency, created_at, paid_at
        FROM orders
        WHERE customer_id = ?
        ORDER BY created_at DESC
      `).bind(id).all<OrderRow>();

      const orders = ordersResult.results || [];

      // Calculate stats
      const statsResult = await c.env.DB.prepare(`
        SELECT
          COUNT(*) as total_orders,
          COALESCE(SUM(total_net), 0) as total_spent,
          COALESCE(AVG(total_net), 0) as avg_order_value
        FROM orders
        WHERE customer_id = ?
      `).bind(id).first<CustomerStats>();

      const stats = statsResult || { total_orders: 0, total_spent: 0, avg_order_value: 0 };

      // Audit Log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind('admin', 'view_customer', `customer:${id}`, JSON.stringify({ customer_id: id })).run();

      return jsonOk(c, { customer, orders, stats });
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
      `).bind(customerId).first<CustomerRow>();

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
    const { name, email } = c.req.valid('json');

    try {
      // Check exists
      const existing = await c.env.DB.prepare('SELECT id FROM customers WHERE id = ?').bind(id).first();
      if (!existing) {
        return jsonError(c, 'Customer not found', 404);
      }

      // Update customer
      await c.env.DB.prepare(`
        UPDATE customers
        SET name = ?, email = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(name, email, id).run();

      // Fetch updated customer
      const customer = await c.env.DB.prepare(`
        SELECT id, name, email, metadata, created_at, updated_at
        FROM customers WHERE id = ?
      `).bind(id).first<CustomerRow>();

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
