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

type MockDbOptions = {
  products?: any[];
  product?: any | null;
  countResult?: { count: number };
  insertLastRowId?: number;
  updateChanges?: number;
  orderItemCount?: { count: number };
};

const createMockDb = (options: MockDbOptions) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        all: vi.fn(async () => {
          if (sql.includes('FROM products')) {
            return { results: options.products || [] };
          }
          return { results: [] };
        }),
        first: vi.fn(async () => {
          if (sql.includes('COUNT(DISTINCT')) {
            return options.orderItemCount || { count: 0 };
          }
          if (sql.includes('COUNT(*)')) {
            return options.countResult || { count: 0 };
          }
          if (sql.includes('FROM products')) {
            return options.product ?? null;
          }
          return null;
        }),
        run: vi.fn(async () => ({
          meta: {
            last_row_id: options.insertLastRowId ?? 1,
            changes: options.updateChanges ?? 1,
          },
        })),
      })),
    })),
  };
};

const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/admin', adminProducts);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, { DB: db, ADMIN_API_KEY: ADMIN_KEY } as any),
  };
};

describe('Admin Products API', () => {
  describe('GET /admin/products', () => {
    it('returns paginated product list', async () => {
      const products = [
        { id: 1, title: 'Product A', status: 'active', created_at: '2026-01-01' },
        { id: 2, title: 'Product B', status: 'draft', created_at: '2026-01-02' },
      ];

      const db = createMockDb({ products, countResult: { count: 2 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.products).toHaveLength(2);
      expect(json.meta.page).toBe(1);
      expect(json.meta.totalCount).toBe(2);
    });

    it('returns empty list when no products exist', async () => {
      const db = createMockDb({ products: [], countResult: { count: 0 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.products).toHaveLength(0);
      expect(json.meta.totalCount).toBe(0);
    });

    it('supports search query parameter', async () => {
      const products = [
        { id: 1, title: 'Matching Product', status: 'active' },
      ];

      const db = createMockDb({ products, countResult: { count: 1 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products?q=Matching', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.products).toHaveLength(1);
    });

    it('supports status filter', async () => {
      const products = [
        { id: 1, title: 'Active Product', status: 'active' },
      ];

      const db = createMockDb({ products, countResult: { count: 1 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products?status=active', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
    });

    it('supports pagination parameters', async () => {
      const db = createMockDb({ products: [], countResult: { count: 50 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products?page=2&perPage=10', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.meta.page).toBe(2);
      expect(json.meta.perPage).toBe(10);
      expect(json.meta.totalPages).toBe(5);
    });
  });

  describe('GET /admin/products/:id', () => {
    it('returns a single product', async () => {
      const product = {
        id: 1,
        title: 'Test Product',
        description: 'A description',
        category: 'Electronics',
        status: 'active',
        created_at: '2026-01-01',
      };

      const db = createMockDb({ product });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/1', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.product.id).toBe(1);
      expect(json.product.title).toBe('Test Product');
    });

    it('returns 404 for non-existent product', async () => {
      const db = createMockDb({ product: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/999', {
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

      const res = await fetch('/admin/products/abc', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /admin/products', () => {
    it('creates a new product', async () => {
      const createdProduct = {
        id: 10,
        title: 'New Product',
        description: 'New description',
        status: 'draft',
        category: 'Books',
        tax_rate_id: 1,
        created_at: '2026-01-15',
      };

      const db = createMockDb({ product: createdProduct, insertLastRowId: 10 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'New Product',
          description: 'New description',
          status: 'draft',
          category: 'Books',
          tax_rate_id: 1,
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.product.title).toBe('New Product');
    });

    it('returns 400 for missing required title', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: 'No title',
          status: 'draft',
          category: 'Books',
          tax_rate_id: 1,
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /admin/products/:id', () => {
    it('updates an existing product', async () => {
      const existing = { id: 1, title: 'Old Title' };
      const updated = {
        id: 1,
        title: 'Updated Title',
        description: 'Updated desc',
        status: 'active',
        category: 'Electronics',
        tax_rate_id: 1,
      };

      // First call returns existing (check exists), second returns updated product
      let callCount = 0;
      const db = createMockDb({ product: updated });
      (db as any).prepare = vi.fn((sql: string) => ({
        bind: vi.fn((..._args: unknown[]) => ({
          all: vi.fn(async () => ({ results: [] })),
          first: vi.fn(async () => {
            if (sql.includes('FROM products')) {
              callCount++;
              if (callCount === 1) return existing; // Check exists
              return updated; // Fetch updated
            }
            return null;
          }),
          run: vi.fn(async () => ({ meta: { last_row_id: 1, changes: 1 } })),
        })),
      }));

      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/1', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Updated Title',
          description: 'Updated desc',
          status: 'active',
          category: 'Electronics',
          tax_rate_id: 1,
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.product.title).toBe('Updated Title');
    });

    it('returns 404 for non-existent product', async () => {
      const db = createMockDb({ product: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/999', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Updated Title',
          description: 'desc',
          status: 'active',
          category: 'Electronics',
          tax_rate_id: 1,
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
    });
  });

  describe('DELETE /admin/products/:id', () => {
    it('archives a product', async () => {
      const existing = { id: 1, title: 'Product', status: 'active' };

      let callCount = 0;
      const db = createMockDb({});
      (db as any).prepare = vi.fn((sql: string) => ({
        bind: vi.fn((..._args: unknown[]) => ({
          all: vi.fn(async () => ({ results: [] })),
          first: vi.fn(async () => {
            if (sql.includes('COUNT(DISTINCT')) {
              return { count: 0 };
            }
            if (sql.includes('FROM products')) {
              return existing;
            }
            return null;
          }),
          run: vi.fn(async () => ({ meta: { last_row_id: 0, changes: 1 } })),
        })),
      }));

      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/1', {
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

      const res = await fetch('/admin/products/999', {
        method: 'DELETE',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
    });

    it('returns 400 when product is already archived', async () => {
      const existing = { id: 1, title: 'Archived Product', status: 'archived' };

      const db = createMockDb({});
      (db as any).prepare = vi.fn((sql: string) => ({
        bind: vi.fn((..._args: unknown[]) => ({
          all: vi.fn(async () => ({ results: [] })),
          first: vi.fn(async () => {
            if (sql.includes('FROM products')) {
              return existing;
            }
            return null;
          }),
          run: vi.fn(async () => ({ meta: { last_row_id: 0, changes: 0 } })),
        })),
      }));

      const { fetch } = createApp(db);

      const res = await fetch('/admin/products/1', {
        method: 'DELETE',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('already archived');
    });
  });
});
