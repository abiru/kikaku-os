import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { Env } from '../../env';
import { jsonOk, jsonError } from '../../lib/http';
import { getActor } from '../../middleware/clerkAuth';
import { validationErrorHandler } from '../../lib/validation';
import {
  categoryNameParamSchema,
  categoryListQuerySchema,
  renameCategorySchema,
  deleteCategorySchema,
  productListQuerySchema,
} from '../../lib/schemas';

const app = new Hono<Env>();

// Custom error handler for zod validation (zod v4 compatible)

type CategoryRow = {
  category: string;
  product_count: number;
};

// GET /categories - List all categories with product counts
app.get(
  '/categories',
  zValidator('query', categoryListQuerySchema, validationErrorHandler),
  async (c) => {
    const { q } = c.req.valid('query');

    try {
      let whereClause = 'WHERE category IS NOT NULL AND category != \'\'';
      const bindings: string[] = [];

      if (q) {
        whereClause += ' AND category LIKE ?';
        bindings.push(`%${q}%`);
      }

      const query = `
        SELECT category, COUNT(*) as product_count
        FROM products
        ${whereClause}
        GROUP BY category
        ORDER BY category ASC
      `;

      const result = await c.env.DB.prepare(query).bind(...bindings).all<CategoryRow>();
      const categories = result.results || [];

      // Audit Log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(
        getActor(c),
        'view_categories',
        'admin_categories_list',
        JSON.stringify({ q, count: categories.length })
      ).run();

      return jsonOk(c, { categories });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to fetch categories');
    }
  }
);

// GET /categories/:name/products - List products in a category
app.get(
  '/categories/:name/products',
  zValidator('param', categoryNameParamSchema, validationErrorHandler),
  zValidator('query', productListQuerySchema, validationErrorHandler),
  async (c) => {
    const { name } = c.req.valid('param');
    const { q, page, perPage } = c.req.valid('query');
    const offset = (page - 1) * perPage;

    try {
      let whereClause = 'WHERE category = ?';
      const bindings: (string | number)[] = [name];

      if (q) {
        whereClause += ' AND (title LIKE ? OR description LIKE ?)';
        bindings.push(`%${q}%`, `%${q}%`);
      }

      // Count total
      const countQuery = `SELECT COUNT(*) as count FROM products ${whereClause}`;
      const countRes = await c.env.DB.prepare(countQuery).bind(...bindings).first<{ count: number }>();
      const totalCount = countRes?.count || 0;

      // Fetch products
      const dataQuery = `
        SELECT id, title, description, category, metadata, status, created_at, updated_at
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
        getActor(c),
        'view_category_products',
        `category:${name}`,
        JSON.stringify({ category: name, q, page, perPage, count: products.results.length })
      ).run();

      return jsonOk(c, {
        category: name,
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
      return jsonError(c, 'Failed to fetch category products');
    }
  }
);

// PUT /categories/:name - Rename category (updates all products)
app.put(
  '/categories/:name',
  zValidator('param', categoryNameParamSchema, validationErrorHandler),
  zValidator('json', renameCategorySchema, validationErrorHandler),
  async (c) => {
    const { name } = c.req.valid('param');
    const { newName } = c.req.valid('json');

    try {
      // Check if source category exists
      const existing = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM products WHERE category = ?'
      ).bind(name).first<{ count: number }>();

      if (!existing || existing.count === 0) {
        return jsonError(c, 'Category not found', 404);
      }

      // Check if target category name already exists (and is different)
      if (newName !== name) {
        const targetExists = await c.env.DB.prepare(
          'SELECT COUNT(*) as count FROM products WHERE category = ?'
        ).bind(newName).first<{ count: number }>();

        if (targetExists && targetExists.count > 0) {
          return jsonError(c, 'Target category name already exists', 409);
        }
      }

      // Update all products with the old category name
      const result = await c.env.DB.prepare(
        'UPDATE products SET category = ?, updated_at = datetime(\'now\') WHERE category = ?'
      ).bind(newName, name).run();

      // Audit Log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(
        getActor(c),
        'rename_category',
        `category:${name}`,
        JSON.stringify({ oldName: name, newName, productsUpdated: result.meta.changes })
      ).run();

      return jsonOk(c, {
        oldName: name,
        newName,
        productsUpdated: result.meta.changes
      });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to rename category');
    }
  }
);

// DELETE /categories/:name - Delete category (sets products' category to null or moves to another)
app.delete(
  '/categories/:name',
  zValidator('param', categoryNameParamSchema, validationErrorHandler),
  zValidator('json', deleteCategorySchema, validationErrorHandler),
  async (c) => {
    const { name } = c.req.valid('param');
    const { moveTo } = c.req.valid('json');

    try {
      // Check if source category exists
      const existing = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM products WHERE category = ?'
      ).bind(name).first<{ count: number }>();

      if (!existing || existing.count === 0) {
        return jsonError(c, 'Category not found', 404);
      }

      // If moveTo is specified and different from current, verify it exists or will be created
      // Update all products - either move to new category or set to null
      const result = await c.env.DB.prepare(
        'UPDATE products SET category = ?, updated_at = datetime(\'now\') WHERE category = ?'
      ).bind(moveTo, name).run();

      // Audit Log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(
        getActor(c),
        'delete_category',
        `category:${name}`,
        JSON.stringify({ deletedCategory: name, movedTo: moveTo, productsUpdated: result.meta.changes })
      ).run();

      return jsonOk(c, {
        deleted: name,
        movedTo: moveTo,
        productsUpdated: result.meta.changes
      });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to delete category');
    }
  }
);

export default app;
