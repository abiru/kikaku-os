import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { Env } from '../../env';
import { jsonOk, jsonError } from '../../lib/http';
import { getActor } from '../../middleware/clerkAuth';
import { loadRbac, requirePermission } from '../../middleware/rbac';
import { validationErrorHandler } from '../../lib/validation';
import { createLogger } from '../../lib/logger';
import {
  createProductSchema,
  updateProductSchema,
  productIdParamSchema,
  productListQuerySchema,
  createVariantSchema,
  updateVariantSchema,
  productVariantParamSchema,
  variantIdParamSchema,
  updatePricesSchema,
  PERMISSIONS,
} from '../../lib/schemas';

const logger = createLogger('admin-products');
const app = new Hono<Env>();

// Apply RBAC middleware to all routes in this file
app.use('*', loadRbac);

// GET /products - List products with pagination and search
app.get(
  '/products',
  requirePermission(PERMISSIONS.PRODUCTS_READ),
  zValidator('query', productListQuerySchema, validationErrorHandler),
  async (c) => {
    const { q, status, page, perPage } = c.req.valid('query');
    const offset = (page - 1) * perPage;

    try {
      const conditions: string[] = [];
      const bindings: (string | number)[] = [];

      if (q) {
        conditions.push('(title LIKE ? OR description LIKE ?)');
        bindings.push(`%${q}%`, `%${q}%`);
      }

      if (status !== 'all') {
        conditions.push('status = ?');
        bindings.push(status);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countQuery = `SELECT COUNT(*) as count FROM products ${whereClause}`;
      const countRes = await c.env.DB.prepare(countQuery).bind(...bindings).first<{ count: number }>();
      const totalCount = countRes?.count || 0;

      const dataQuery = `
        SELECT id, title, description, category, metadata, status, tax_rate_id, featured, created_at, updated_at
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
      logger.error('Failed to fetch products', { error: String(e) });
      return jsonError(c, 'Failed to fetch products');
    }
  }
);

// GET /products/:id - Fetch single product
app.get(
  '/products/:id',
  requirePermission(PERMISSIONS.PRODUCTS_READ),
  zValidator('param', productIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      const product = await c.env.DB.prepare(`
        SELECT id, title, description, category, metadata, status, tax_rate_id, featured, created_at, updated_at
        FROM products
        WHERE id = ?
      `).bind(id).first();

      if (!product) {
        return jsonError(c, 'Product not found', 404);
      }

      // Audit Log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(getActor(c), 'view_product', `product:${id}`, JSON.stringify({ product_id: id })).run();

      return jsonOk(c, { product });
    } catch (e) {
      logger.error('Failed to fetch product', { error: String(e) });
      return jsonError(c, 'Failed to fetch product');
    }
  }
);

// POST /products - Create product
app.post(
  '/products',
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  zValidator('json', createProductSchema, validationErrorHandler),
  async (c) => {
    const { title, description, status, category, tax_rate_id } = c.req.valid('json');

    try {
      const result = await c.env.DB.prepare(`
        INSERT INTO products (title, description, status, category, tax_rate_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(title, description, status, category, tax_rate_id).run();

      const productId = result.meta.last_row_id;

      // Fetch created product
      const product = await c.env.DB.prepare(`
        SELECT id, title, description, category, metadata, status, tax_rate_id, created_at, updated_at
        FROM products WHERE id = ?
      `).bind(productId).first();

      // Audit Log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(getActor(c), 'create_product', `product:${productId}`, JSON.stringify({ title })).run();

      return jsonOk(c, { product });
    } catch (e) {
      logger.error('Failed to create product', { error: String(e) });
      return jsonError(c, 'Failed to create product');
    }
  }
);

// PUT /products/:id - Update product
app.put(
  '/products/:id',
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  zValidator('param', productIdParamSchema, validationErrorHandler),
  zValidator('json', updateProductSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');
    const { title, description, status, category, tax_rate_id, featured } = c.req.valid('json');

    try {
      // Check exists
      const existing = await c.env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(id).first();
      if (!existing) {
        return jsonError(c, 'Product not found', 404);
      }

      await c.env.DB.prepare(`
        UPDATE products
        SET title = ?, description = ?, status = ?, category = ?, tax_rate_id = ?, featured = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(title, description, status, category, tax_rate_id, featured ?? 0, id).run();

      // Fetch updated product
      const product = await c.env.DB.prepare(`
        SELECT id, title, description, category, metadata, status, tax_rate_id, featured, created_at, updated_at
        FROM products WHERE id = ?
      `).bind(id).first();

      // Audit Log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(getActor(c), 'update_product', `product:${id}`, JSON.stringify({ title })).run();

      return jsonOk(c, { product });
    } catch (e) {
      logger.error('Failed to update product', { error: String(e) });
      return jsonError(c, 'Failed to update product');
    }
  }
);

// DELETE /products/:id - Archive product
app.delete(
  '/products/:id',
  requirePermission(PERMISSIONS.PRODUCTS_DELETE),
  zValidator('param', productIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      const existing = await c.env.DB.prepare(
        'SELECT id, title, status FROM products WHERE id = ?'
      ).bind(id).first<{ id: number; title: string; status: string }>();

      if (!existing) {
        return jsonError(c, 'Product not found', 404);
      }

      if (existing.status === 'archived') {
        return jsonError(c, 'Product is already archived', 400);
      }

      // Check for existing orders (for audit metadata)
      const orderCount = await c.env.DB.prepare(`
        SELECT COUNT(DISTINCT oi.order_id) as count
        FROM order_items oi
        INNER JOIN variants v ON oi.variant_id = v.id
        WHERE v.product_id = ?
      `).bind(id).first<{ count: number }>();

      // Archive by updating status
      await c.env.DB.prepare(`
        UPDATE products
        SET status = 'archived', updated_at = datetime('now')
        WHERE id = ?
      `).bind(id).run();

      // Audit Log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(
        getActor(c),
        'archive_product',
        `product:${id}`,
        JSON.stringify({
          title: existing.title,
          previous_status: existing.status,
          order_count: orderCount?.count || 0
        })
      ).run();

      return jsonOk(c, { archived: true });
    } catch (e) {
      logger.error('Failed to archive product', { error: String(e) });
      return jsonError(c, 'Failed to archive product');
    }
  }
);

// POST /products/:id/restore - Restore archived product
app.post(
  '/products/:id/restore',
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  zValidator('param', productIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      const existing = await c.env.DB.prepare(
        'SELECT id, title, status FROM products WHERE id = ?'
      ).bind(id).first<{ id: number; title: string; status: string }>();

      if (!existing) {
        return jsonError(c, 'Product not found', 404);
      }

      if (existing.status !== 'archived') {
        return jsonError(c, 'Product is not archived', 400);
      }

      // Restore to 'draft' status
      await c.env.DB.prepare(`
        UPDATE products
        SET status = 'draft', updated_at = datetime('now')
        WHERE id = ?
      `).bind(id).run();

      // Audit Log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(
        getActor(c),
        'restore_product',
        `product:${id}`,
        JSON.stringify({ title: existing.title })
      ).run();

      return jsonOk(c, { restored: true });
    } catch (e) {
      logger.error('Failed to restore product', { error: String(e) });
      return jsonError(c, 'Failed to restore product');
    }
  }
);

// =====================
// Variant Endpoints
// =====================

type VariantRow = {
  id: number;
  product_id: number;
  title: string;
  sku: string | null;
  options: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
  prices?: PriceRow[];
};

type PriceRow = {
  id: number;
  variant_id: number;
  currency: string;
  amount: number;
  provider_price_id: string | null;
};

// GET /products/:id/variants - List variants with prices
app.get(
  '/products/:id/variants',
  requirePermission(PERMISSIONS.PRODUCTS_READ),
  zValidator('param', productIdParamSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      // Check product exists
      const product = await c.env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(id).first();
      if (!product) {
        return jsonError(c, 'Product not found', 404);
      }

      // Fetch variants
      const variantsResult = await c.env.DB.prepare(`
        SELECT id, product_id, title, sku, options, metadata, created_at, updated_at
        FROM variants
        WHERE product_id = ?
        ORDER BY id ASC
      `).bind(id).all<VariantRow>();

      const variants = variantsResult.results || [];

      // Fetch prices for all variants
      if (variants.length > 0) {
        const variantIds = variants.map((v) => v.id);
        const placeholders = variantIds.map(() => '?').join(',');
        const pricesResult = await c.env.DB.prepare(`
          SELECT id, variant_id, currency, amount, provider_price_id
          FROM prices
          WHERE variant_id IN (${placeholders})
        `).bind(...variantIds).all<PriceRow>();

        const prices = pricesResult.results || [];

        // Attach prices to variants
        for (const variant of variants) {
          variant.prices = prices.filter((p) => p.variant_id === variant.id);
        }
      }

      // Audit Log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(getActor(c), 'view_variants', `product:${id}`, JSON.stringify({ product_id: id, count: variants.length })).run();

      return jsonOk(c, { variants });
    } catch (e) {
      logger.error('Failed to fetch variants', { error: String(e) });
      return jsonError(c, 'Failed to fetch variants');
    }
  }
);

// POST /products/:id/variants - Create variant
app.post(
  '/products/:id/variants',
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  zValidator('param', productIdParamSchema, validationErrorHandler),
  zValidator('json', createVariantSchema, validationErrorHandler),
  async (c) => {
    const { id } = c.req.valid('param');
    const { title, sku, options } = c.req.valid('json');

    try {
      // Check product exists
      const product = await c.env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(id).first();
      if (!product) {
        return jsonError(c, 'Product not found', 404);
      }

      // Insert variant
      const result = await c.env.DB.prepare(`
        INSERT INTO variants (product_id, title, sku, options, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(id, title, sku, options ? JSON.stringify(options) : null).run();

      const variantId = result.meta.last_row_id;

      // Fetch created variant
      const variant = await c.env.DB.prepare(`
        SELECT id, product_id, title, sku, options, metadata, created_at, updated_at
        FROM variants WHERE id = ?
      `).bind(variantId).first<VariantRow>();

      if (variant) {
        variant.prices = [];
      }

      // Audit Log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(getActor(c), 'create_variant', `variant:${variantId}`, JSON.stringify({ product_id: id, title })).run();

      return jsonOk(c, { variant });
    } catch (e) {
      logger.error('Failed to create variant', { error: String(e) });
      return jsonError(c, 'Failed to create variant');
    }
  }
);

// PUT /products/:id/variants/:variantId - Update variant
app.put(
  '/products/:id/variants/:variantId',
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  zValidator('param', productVariantParamSchema, validationErrorHandler),
  zValidator('json', updateVariantSchema, validationErrorHandler),
  async (c) => {
    const { id, variantId } = c.req.valid('param');
    const { title, sku, options } = c.req.valid('json');

    try {
      // Check variant exists and belongs to product
      const existing = await c.env.DB.prepare(
        'SELECT id FROM variants WHERE id = ? AND product_id = ?'
      ).bind(variantId, id).first();

      if (!existing) {
        return jsonError(c, 'Variant not found', 404);
      }

      // Update variant
      await c.env.DB.prepare(`
        UPDATE variants
        SET title = ?, sku = ?, options = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(title, sku, options ? JSON.stringify(options) : null, variantId).run();

      // Fetch updated variant with prices
      const variant = await c.env.DB.prepare(`
        SELECT id, product_id, title, sku, options, metadata, created_at, updated_at
        FROM variants WHERE id = ?
      `).bind(variantId).first<VariantRow>();

      if (variant) {
        const pricesResult = await c.env.DB.prepare(`
          SELECT id, variant_id, currency, amount, provider_price_id
          FROM prices WHERE variant_id = ?
        `).bind(variantId).all<PriceRow>();
        variant.prices = pricesResult.results || [];
      }

      // Audit Log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(getActor(c), 'update_variant', `variant:${variantId}`, JSON.stringify({ product_id: id, title })).run();

      return jsonOk(c, { variant });
    } catch (e) {
      logger.error('Failed to update variant', { error: String(e) });
      return jsonError(c, 'Failed to update variant');
    }
  }
);

// DELETE /products/:id/variants/:variantId - Delete variant (cascade prices)
app.delete(
  '/products/:id/variants/:variantId',
  requirePermission(PERMISSIONS.PRODUCTS_DELETE),
  zValidator('param', productVariantParamSchema, validationErrorHandler),
  async (c) => {
    const { id, variantId } = c.req.valid('param');

    try {
      // Check variant exists and belongs to product
      const existing = await c.env.DB.prepare(
        'SELECT id, title FROM variants WHERE id = ? AND product_id = ?'
      ).bind(variantId, id).first<{ id: number; title: string }>();

      if (!existing) {
        return jsonError(c, 'Variant not found', 404);
      }

      // Delete prices first (manual cascade)
      await c.env.DB.prepare('DELETE FROM prices WHERE variant_id = ?').bind(variantId).run();

      // Delete variant
      await c.env.DB.prepare('DELETE FROM variants WHERE id = ?').bind(variantId).run();

      // Audit Log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(getActor(c), 'delete_variant', `variant:${variantId}`, JSON.stringify({ product_id: id, title: existing.title })).run();

      return jsonOk(c, { deleted: true });
    } catch (e) {
      logger.error('Failed to delete variant', { error: String(e) });
      return jsonError(c, 'Failed to delete variant');
    }
  }
);

// =====================
// Price Endpoints
// =====================

// PUT /variants/:variantId/prices - Update/replace prices for variant
app.put(
  '/variants/:variantId/prices',
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  zValidator('param', variantIdParamSchema, validationErrorHandler),
  zValidator('json', updatePricesSchema, validationErrorHandler),
  async (c) => {
    const { variantId } = c.req.valid('param');
    const { prices } = c.req.valid('json');

    try {
      // Check variant exists
      const variant = await c.env.DB.prepare(
        'SELECT id, product_id FROM variants WHERE id = ?'
      ).bind(variantId).first<{ id: number; product_id: number }>();

      if (!variant) {
        return jsonError(c, 'Variant not found', 404);
      }

      // Delete existing prices
      await c.env.DB.prepare('DELETE FROM prices WHERE variant_id = ?').bind(variantId).run();

      // Insert new prices
      const insertedPrices: PriceRow[] = [];
      for (const price of prices) {
        const result = await c.env.DB.prepare(`
          INSERT INTO prices (variant_id, currency, amount, provider_price_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
        `).bind(variantId, price.currency, price.amount, price.provider_price_id).run();

        insertedPrices.push({
          id: Number(result.meta.last_row_id),
          variant_id: variantId,
          currency: price.currency,
          amount: price.amount,
          provider_price_id: price.provider_price_id || null,
        });
      }

      // Audit Log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(getActor(c), 'update_prices', `variant:${variantId}`, JSON.stringify({ product_id: variant.product_id, count: prices.length })).run();

      return jsonOk(c, { prices: insertedPrices });
    } catch (e) {
      logger.error('Failed to update prices', { error: String(e) });
      return jsonError(c, 'Failed to update prices');
    }
  }
);

export default app;
