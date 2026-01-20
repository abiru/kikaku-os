import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { Env } from '../env';
import { jsonOk, jsonError } from '../lib/http';
import { getActor } from '../middleware/clerkAuth';
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
        SELECT id, title, description, category, metadata, status, created_at, updated_at
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
    const { title, description, status, category } = c.req.valid('json');

    try {
      const result = await c.env.DB.prepare(`
        INSERT INTO products (title, description, status, category, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(title, description, status, category).run();

      const productId = result.meta.last_row_id;

      // Fetch created product
      const product = await c.env.DB.prepare(`
        SELECT id, title, description, category, metadata, status, created_at, updated_at
        FROM products WHERE id = ?
      `).bind(productId).first();

      // Audit Log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(getActor(c), 'create_product', `product:${productId}`, JSON.stringify({ title })).run();

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
    const { title, description, status, category } = c.req.valid('json');

    try {
      // Check exists
      const existing = await c.env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(id).first();
      if (!existing) {
        return jsonError(c, 'Product not found', 404);
      }

      await c.env.DB.prepare(`
        UPDATE products
        SET title = ?, description = ?, status = ?, category = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(title, description, status, category, id).run();

      // Fetch updated product
      const product = await c.env.DB.prepare(`
        SELECT id, title, description, category, metadata, status, created_at, updated_at
        FROM products WHERE id = ?
      `).bind(id).first();

      // Audit Log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(getActor(c), 'update_product', `product:${id}`, JSON.stringify({ title })).run();

      return jsonOk(c, { product });
    } catch (e) {
      console.error(e);
      return jsonError(c, 'Failed to update product');
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
      console.error(e);
      return jsonError(c, 'Failed to fetch variants');
    }
  }
);

// POST /products/:id/variants - Create variant
app.post(
  '/products/:id/variants',
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
      console.error(e);
      return jsonError(c, 'Failed to create variant');
    }
  }
);

// PUT /products/:id/variants/:variantId - Update variant
app.put(
  '/products/:id/variants/:variantId',
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
      console.error(e);
      return jsonError(c, 'Failed to update variant');
    }
  }
);

// DELETE /products/:id/variants/:variantId - Delete variant (cascade prices)
app.delete(
  '/products/:id/variants/:variantId',
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
      console.error(e);
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
      console.error(e);
      return jsonError(c, 'Failed to update prices');
    }
  }
);

export default app;
