import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import adminProducts from '../../../routes/admin/adminProducts';

vi.mock('../../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
}));

vi.mock('../../../middleware/rbac', () => ({
  loadRbac: async (_c: any, next: any) => next(),
  requirePermission: () => async (_c: any, next: any) => next(),
}));

const ADMIN_KEY = 'test-admin-key';

const sampleProduct = {
  id: 1,
  title: 'Test Product',
  description: 'A test product',
  category: 'general',
  metadata: null,
  status: 'active',
  tax_rate_id: 1,
  featured: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const sampleVariant = {
  id: 10,
  product_id: 1,
  title: 'Default',
  sku: 'SKU-001',
  options: null,
  metadata: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const samplePrice = {
  id: 100,
  variant_id: 10,
  currency: 'JPY',
  amount: 1000,
  provider_price_id: null,
};

type MockDbOptions = {
  product?: any | null;
  products?: any[];
  totalCount?: number;
  variant?: any | null;
  variants?: any[];
  prices?: any[];
  insertId?: number;
  orderCount?: number;
};

const createMockDb = (options: MockDbOptions = {}) => {
  const {
    product = null,
    products = [],
    totalCount = 0,
    variant = null,
    variants = [],
    prices = [],
    insertId = 1,
    orderCount = 0,
  } = options;

  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        all: vi.fn(async () => {
          if (sql.includes('FROM products')) {
            return { results: products };
          }
          if (sql.includes('FROM variants')) {
            return { results: variants };
          }
          if (sql.includes('FROM prices')) {
            return { results: prices };
          }
          return { results: [] };
        }),
        first: vi.fn(async () => {
          if (sql.includes('COUNT(*)') && sql.includes('products')) {
            return { count: totalCount };
          }
          if (sql.includes('COUNT(DISTINCT') && sql.includes('order_items')) {
            return { count: orderCount };
          }
          if (sql.includes('FROM products')) {
            return product;
          }
          if (sql.includes('FROM variants')) {
            return variant;
          }
          return null;
        }),
        run: vi.fn(async () => ({ meta: { last_row_id: insertId } })),
      })),
    })),
  };
};

const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/admin/products', adminProducts);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, { DB: db, ADMIN_API_KEY: ADMIN_KEY } as any),
  };
};

// =====================
// Product Endpoints
// =====================

describe('Admin Products API', () => {
  describe('GET /admin/products', () => {
    it('returns list of products with pagination meta', async () => {
      const db = createMockDb({
        products: [sampleProduct],
        totalCount: 1,
      });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.products).toHaveLength(1);
      expect(json.products[0].title).toBe('Test Product');
      expect(json.meta).toEqual({
        page: 1,
        perPage: 20,
        totalCount: 1,
        totalPages: 1,
      });
    });

    it('returns empty list when no products exist', async () => {
      const db = createMockDb({ products: [], totalCount: 0 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.products).toHaveLength(0);
      expect(json.meta.totalCount).toBe(0);
      expect(json.meta.totalPages).toBe(0);
    });

    it('supports pagination via page and perPage query params', async () => {
      const db = createMockDb({
        products: [sampleProduct],
        totalCount: 50,
      });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products?page=2&perPage=10', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.meta.page).toBe(2);
      expect(json.meta.perPage).toBe(10);
      expect(json.meta.totalCount).toBe(50);
      expect(json.meta.totalPages).toBe(5);
    });

    it('supports search via q query param', async () => {
      const db = createMockDb({
        products: [sampleProduct],
        totalCount: 1,
      });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products?q=Test', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      // Verify the SQL was prepared with search term
      expect(db.prepare).toHaveBeenCalled();
    });

    it('supports status filter', async () => {
      const db = createMockDb({
        products: [sampleProduct],
        totalCount: 1,
      });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products?status=active', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
    });
  });

  describe('GET /admin/products/:id', () => {
    it('returns a single product', async () => {
      const db = createMockDb({ product: sampleProduct });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/1', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.product.title).toBe('Test Product');
      expect(json.product.id).toBe(1);
    });

    it('returns 404 for non-existent product', async () => {
      const db = createMockDb({ product: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/999', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('not found');
    });

    it('returns 400 for invalid id param', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/abc', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /admin/products', () => {
    it('creates a new product', async () => {
      const createdProduct = { ...sampleProduct, id: 5 };
      const db = createMockDb({ product: createdProduct, insertId: 5 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Test Product',
          description: 'A test product',
          status: 'active',
          category: 'general',
          tax_rate_id: 1,
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.product.title).toBe('Test Product');
    });

    it('creates a product with minimal fields (title only)', async () => {
      const createdProduct = {
        ...sampleProduct,
        id: 6,
        description: null,
        category: null,
        tax_rate_id: null,
      };
      const db = createMockDb({ product: createdProduct, insertId: 6 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 'Minimal Product' }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
    });

    it('returns 400 when title is missing', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ description: 'No title' }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
    });

    it('returns 400 when title is empty string', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: '' }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid status value', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 'Product', status: 'invalid' }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /admin/products/:id', () => {
    it('updates an existing product', async () => {
      const existingProduct = { id: 1 };
      const updatedProduct = { ...sampleProduct, title: 'Updated Title' };
      // first() returns existing product for existence check, then the updated product
      const db = createMockDb({ product: existingProduct });
      // Override to return different results on successive calls
      let callCount = 0;
      db.prepare = vi.fn((sql: string) => ({
        bind: vi.fn((..._args: unknown[]) => ({
          all: vi.fn(async () => ({ results: [] })),
          first: vi.fn(async () => {
            if (sql.includes('SELECT id FROM products')) {
              return existingProduct;
            }
            if (sql.includes('SELECT id, title, description')) {
              callCount++;
              return updatedProduct;
            }
            return null;
          }),
          run: vi.fn(async () => ({ meta: { last_row_id: 1 } })),
        })),
      }));

      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/1', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Updated Title',
          description: 'Updated desc',
          status: 'active',
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.product).toBeDefined();
    });

    it('returns 404 for non-existent product', async () => {
      const db = createMockDb({ product: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/999', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 'Updated' }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('not found');
    });

    it('returns 400 for invalid id param', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/abc', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 'Updated' }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 when title is missing', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/1', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ description: 'No title' }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /admin/products/:id', () => {
    it('archives an active product', async () => {
      const existing = { id: 1, title: 'Test Product', status: 'active' };
      const db = createMockDb({ product: existing, orderCount: 0 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/1', {
        method: 'DELETE',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.archived).toBe(true);
    });

    it('returns 404 for non-existent product', async () => {
      const db = createMockDb({ product: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/999', {
        method: 'DELETE',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('not found');
    });

    it('returns 400 when product is already archived', async () => {
      const existing = { id: 1, title: 'Archived Product', status: 'archived' };
      const db = createMockDb({ product: existing });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/1', {
        method: 'DELETE',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('already archived');
    });

    it('returns 400 for invalid id param', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/abc', {
        method: 'DELETE',
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /admin/products/:id/restore', () => {
    it('restores an archived product', async () => {
      const existing = { id: 1, title: 'Archived Product', status: 'archived' };
      const db = createMockDb({ product: existing });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/1/restore', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.restored).toBe(true);
    });

    it('returns 404 for non-existent product', async () => {
      const db = createMockDb({ product: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/999/restore', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('not found');
    });

    it('returns 400 when product is not archived', async () => {
      const existing = { id: 1, title: 'Active Product', status: 'active' };
      const db = createMockDb({ product: existing });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/1/restore', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('not archived');
    });
  });

  // =====================
  // Variant Endpoints
  // =====================

  describe('GET /admin/products/:id/variants', () => {
    it('returns variants with prices for a product', async () => {
      const variantWithPrices = { ...sampleVariant };
      const db = createMockDb({
        product: { id: 1 },
        variants: [variantWithPrices],
        prices: [samplePrice],
      });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/1/variants', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.variants).toHaveLength(1);
      expect(json.variants[0].title).toBe('Default');
      expect(json.variants[0].prices).toHaveLength(1);
      expect(json.variants[0].prices[0].amount).toBe(1000);
    });

    it('returns empty array when product has no variants', async () => {
      const db = createMockDb({
        product: { id: 1 },
        variants: [],
      });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/1/variants', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.variants).toHaveLength(0);
    });

    it('returns 404 when product does not exist', async () => {
      const db = createMockDb({ product: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/999/variants', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('not found');
    });
  });

  describe('POST /admin/products/:id/variants', () => {
    it('creates a variant for a product', async () => {
      const createdVariant = { ...sampleVariant, id: 20 };
      // Need to handle: first call checks product exists, second fetches created variant
      const db = createMockDb({ insertId: 20 });
      db.prepare = vi.fn((sql: string) => ({
        bind: vi.fn((..._args: unknown[]) => ({
          all: vi.fn(async () => ({ results: [] })),
          first: vi.fn(async () => {
            if (sql.includes('SELECT id FROM products')) {
              return { id: 1 };
            }
            if (sql.includes('FROM variants')) {
              return createdVariant;
            }
            return null;
          }),
          run: vi.fn(async () => ({ meta: { last_row_id: 20 } })),
        })),
      }));
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/1/variants', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Default',
          sku: 'SKU-001',
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.variant).toBeDefined();
      expect(json.variant.prices).toEqual([]);
    });

    it('returns 404 when product does not exist', async () => {
      const db = createMockDb({ product: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/999/variants', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 'Variant' }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('not found');
    });

    it('returns 400 when title is missing', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/1/variants', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sku: 'SKU-001' }),
      });

      expect(res.status).toBe(400);
    });

    it('creates a variant with options', async () => {
      const createdVariant = {
        ...sampleVariant,
        id: 21,
        options: JSON.stringify({ size: 'M', color: 'Red' }),
      };
      const db = createMockDb({ insertId: 21 });
      db.prepare = vi.fn((sql: string) => ({
        bind: vi.fn((..._args: unknown[]) => ({
          all: vi.fn(async () => ({ results: [] })),
          first: vi.fn(async () => {
            if (sql.includes('SELECT id FROM products')) {
              return { id: 1 };
            }
            if (sql.includes('FROM variants')) {
              return createdVariant;
            }
            return null;
          }),
          run: vi.fn(async () => ({ meta: { last_row_id: 21 } })),
        })),
      }));
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/1/variants', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Red M',
          sku: 'SKU-RED-M',
          options: { size: 'M', color: 'Red' },
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.variant).toBeDefined();
    });
  });

  describe('PUT /admin/products/:id/variants/:variantId', () => {
    it('updates an existing variant', async () => {
      const updatedVariant = { ...sampleVariant, title: 'Updated Variant' };
      const db = createMockDb({});
      db.prepare = vi.fn((sql: string) => ({
        bind: vi.fn((..._args: unknown[]) => ({
          all: vi.fn(async () => {
            if (sql.includes('FROM prices')) {
              return { results: [samplePrice] };
            }
            return { results: [] };
          }),
          first: vi.fn(async () => {
            if (sql.includes('SELECT id FROM variants')) {
              return { id: 10 };
            }
            if (sql.includes('FROM variants WHERE id')) {
              return updatedVariant;
            }
            return null;
          }),
          run: vi.fn(async () => ({ meta: { last_row_id: 10 } })),
        })),
      }));
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/1/variants/10', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Updated Variant',
          sku: 'SKU-002',
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.variant).toBeDefined();
      expect(json.variant.prices).toHaveLength(1);
    });

    it('returns 404 when variant does not exist', async () => {
      const db = createMockDb({ variant: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/1/variants/999', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 'Updated' }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('not found');
    });

    it('returns 400 for invalid variant id param', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/1/variants/abc', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 'Updated' }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 when title is missing', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/1/variants/10', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sku: 'SKU-only' }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /admin/products/:id/variants/:variantId', () => {
    it('deletes a variant and its prices', async () => {
      const existing = { id: 10, title: 'Default' };
      const db = createMockDb({});
      db.prepare = vi.fn((sql: string) => ({
        bind: vi.fn((..._args: unknown[]) => ({
          all: vi.fn(async () => ({ results: [] })),
          first: vi.fn(async () => {
            if (sql.includes('SELECT id, title FROM variants')) {
              return existing;
            }
            return null;
          }),
          run: vi.fn(async () => ({ meta: { last_row_id: 0 } })),
        })),
      }));
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/1/variants/10', {
        method: 'DELETE',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.deleted).toBe(true);
    });

    it('returns 404 when variant does not exist', async () => {
      const db = createMockDb({ variant: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/1/variants/999', {
        method: 'DELETE',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('not found');
    });

    it('returns 400 for invalid variant id param', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/products/1/variants/abc', {
        method: 'DELETE',
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(res.status).toBe(400);
    });
  });

  // =====================
  // Price Endpoints
  // =====================

  describe('PUT /admin/products/variants/:variantId/prices', () => {
    it('replaces prices for a variant', async () => {
      const db = createMockDb({ insertId: 200 });
      let insertCount = 0;
      db.prepare = vi.fn((sql: string) => ({
        bind: vi.fn((..._args: unknown[]) => ({
          all: vi.fn(async () => ({ results: [] })),
          first: vi.fn(async () => {
            if (sql.includes('SELECT id, product_id FROM variants')) {
              return { id: 10, product_id: 1 };
            }
            return null;
          }),
          run: vi.fn(async () => {
            insertCount++;
            return { meta: { last_row_id: 200 + insertCount } };
          }),
        })),
      }));
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/variants/10/prices', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prices: [
            { currency: 'JPY', amount: 1500 },
            { currency: 'USD', amount: 15, provider_price_id: 'price_123' },
          ],
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.prices).toHaveLength(2);
      expect(json.prices[0].currency).toBe('JPY');
      expect(json.prices[0].amount).toBe(1500);
      expect(json.prices[1].currency).toBe('USD');
    });

    it('returns 404 when variant does not exist', async () => {
      const db = createMockDb({});
      db.prepare = vi.fn((sql: string) => ({
        bind: vi.fn((..._args: unknown[]) => ({
          all: vi.fn(async () => ({ results: [] })),
          first: vi.fn(async () => null),
          run: vi.fn(async () => ({ meta: { last_row_id: 0 } })),
        })),
      }));
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/variants/999/prices', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prices: [{ currency: 'JPY', amount: 1000 }],
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('not found');
    });

    it('returns 400 when prices array is empty', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/variants/10/prices', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prices: [] }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 when amount is negative', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/variants/10/prices', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prices: [{ currency: 'JPY', amount: -100 }],
        }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 when currency is invalid length', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/variants/10/prices', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prices: [{ currency: 'JPYY', amount: 100 }],
        }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid variant id param', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/variants/abc/prices', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prices: [{ currency: 'JPY', amount: 100 }],
        }),
      });

      expect(res.status).toBe(400);
    });
  });
});
