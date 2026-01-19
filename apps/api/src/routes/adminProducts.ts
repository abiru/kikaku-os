import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { Env } from '../env';
import { jsonOk, jsonError } from '../lib/http';
import {
  createProductSchema,
  updateProductSchema,
  productIdParamSchema,
  productListQuerySchema,
} from '../lib/schemas';

const app = new Hono<Env>();

// Custom error handler for zod validation (zod v4 compatible)
const validationErrorHandler = (result: { success: boolean; error?: { issues: Array<{ message: string }> } }, c: any) => {
  if (!result.success) {
    const messages = result.error?.issues.map((e) => e.message).join(', ') || 'Validation failed';
    return c.json({ ok: false, message: messages }, 400);
  }
};

// GET /products - List products with pagination and search
app.get(
  '/products',
  zValidator('query', productListQuerySchema, validationErrorHandler),
  async (c) => {
    const { q, page, perPage } = c.req.valid('query');
    const offset = (page - 1) * perPage;

    try {
      let whereClause = '';
      const bindings: (string | number)[] = [];

      if (q) {
        whereClause = 'WHERE title LIKE ? OR description LIKE ?';
        bindings.push(`%${q}%`, `%${q}%`);
      }

      const countQuery = `SELECT COUNT(*) as count FROM products ${whereClause}`;
      const countRes = await c.env.DB.prepare(countQuery).bind(...bindings).first<{ count: number }>();
      const totalCount = countRes?.count || 0;

      const dataQuery = `
        SELECT id, title, description, metadata, status, created_at, updated_at
        FROM products
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;
      bindings.push(perPage, offset);

      const products = await c.env.DB.prepare(dataQuery).bind(...bindings).all();

      // Audit Log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(
        'admin',
        'view_products',
        'admin_products_list',
        JSON.stringify({ q, page, perPage, count: products.results.length })
      ).run();

      return jsonOk(c, {
        products: products.results,
        meta: {
          page,
          perPage,
          totalCount,
          totalPages: Math.ceil(totalCount / perPage)
        }
      });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to fetch products');
    }
  }
);

// GET /products/:id - Fetch single product
app.get(
  '/products/:id',
  zValidator('param', productIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      const product = await c.env.DB.prepare(`
        SELECT id, title, description, metadata, status, created_at, updated_at
        FROM products
        WHERE id = ?
      `).bind(id).first();

      if (!product) {
        return jsonError(c, 'Product not found', 404);
      }

      // Audit Log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind('admin', 'view_product', `product:${id}`, JSON.stringify({ product_id: id })).run();

      return jsonOk(c, { product });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to fetch product');
    }
  }
);

// POST /products - Create product
app.post(
  '/products',
  zValidator('json', createProductSchema, validationErrorHandler),
  async (c) => {
    const { title, description, status } = c.req.valid('json');

    try {
      const result = await c.env.DB.prepare(`
        INSERT INTO products (title, description, status, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
      `).bind(title, description, status).run();

      const productId = result.meta.last_row_id;

      // Fetch created product
      const product = await c.env.DB.prepare(`
        SELECT id, title, description, metadata, status, created_at, updated_at
        FROM products WHERE id = ?
      `).bind(productId).first();

      // Audit Log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind('admin', 'create_product', `product:${productId}`, JSON.stringify({ title })).run();

      return jsonOk(c, { product });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to create product');
    }
  }
);

// PUT /products/:id - Update product
app.put(
  '/products/:id',
  zValidator('param', productIdParamSchema, validationErrorHandler),
  zValidator('json', updateProductSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');
    const { title, description, status } = c.req.valid('json');

    try {
      // Check exists
      const existing = await c.env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(id).first();
      if (!existing) {
        return jsonError(c, 'Product not found', 404);
      }

      await c.env.DB.prepare(`
        UPDATE products
        SET title = ?, description = ?, status = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(title, description, status, id).run();

      // Fetch updated product
      const product = await c.env.DB.prepare(`
        SELECT id, title, description, metadata, status, created_at, updated_at
        FROM products WHERE id = ?
      `).bind(id).first();

      // Audit Log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind('admin', 'update_product', `product:${id}`, JSON.stringify({ title })).run();

      return jsonOk(c, { product });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to update product');
    }
  }
);

export default app;
