import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import adminCategories from '../../../routes/admin/adminCategories';

vi.mock('../../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
}));

vi.mock('../../../middleware/rbac', () => ({
  loadRbac: async (_c: any, next: any) => next(),
  requirePermission: () => async (_c: any, next: any) => next(),
}));

const ADMIN_KEY = 'test-admin-key';

const createMockDb = (options: {
  categories?: any[];
  products?: any[];
  countResult?: { count: number };
  renameChanges?: number;
  deleteChanges?: number;
}) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        all: vi.fn(async () => {
          if (sql.includes('GROUP BY category')) {
            return { results: options.categories || [] };
          }
          if (sql.includes('FROM products') && !sql.includes('COUNT') && !sql.includes('GROUP BY')) {
            return { results: options.products || [] };
          }
          return { results: [] };
        }),
        first: vi.fn(async () => {
          if (sql.includes('COUNT(*)')) {
            return options.countResult || { count: 0 };
          }
          return null;
        }),
        run: vi.fn(async () => ({
          meta: {
            changes: sql.includes('UPDATE') ? (options.renameChanges ?? options.deleteChanges ?? 0) : 0,
            last_row_id: 0,
          },
        })),
      })),
    })),
  };
};

const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/admin', adminCategories);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, { DB: db, ADMIN_API_KEY: ADMIN_KEY } as any),
  };
};

describe('Admin Categories API', () => {
  describe('GET /admin/categories', () => {
    it('returns list of categories with product counts', async () => {
      const categories = [
        { category: 'Electronics', product_count: 10 },
        { category: 'Clothing', product_count: 5 },
      ];

      const db = createMockDb({ categories });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/categories', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.categories).toHaveLength(2);
      expect(json.categories[0].category).toBe('Electronics');
      expect(json.categories[0].product_count).toBe(10);
    });

    it('returns empty list when no categories exist', async () => {
      const db = createMockDb({ categories: [] });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/categories', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.categories).toHaveLength(0);
    });
  });

  describe('GET /admin/categories/:name/products', () => {
    it('returns products in a category', async () => {
      const products = [
        { id: 1, title: 'Product A', category: 'Electronics' },
        { id: 2, title: 'Product B', category: 'Electronics' },
      ];

      const db = createMockDb({
        products,
        countResult: { count: 2 },
      });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/categories/Electronics/products', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.category).toBe('Electronics');
      expect(json.products).toHaveLength(2);
      expect(json.meta.totalCount).toBe(2);
    });

    it('returns empty when category has no products', async () => {
      const db = createMockDb({ products: [], countResult: { count: 0 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/categories/Empty/products', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.products).toHaveLength(0);
    });
  });

  describe('PUT /admin/categories/:name', () => {
    it('renames a category', async () => {
      // First call returns count > 0 (source exists), second call returns count = 0 (target doesn't exist)
      let callCount = 0;
      const db = createMockDb({ renameChanges: 5 });
      (db as any).prepare = vi.fn((sql: string) => ({
        bind: vi.fn((..._args: unknown[]) => ({
          all: vi.fn(async () => ({ results: [] as any[] })),
          first: vi.fn(async () => {
            if (sql.includes('COUNT(*)')) {
              callCount++;
              if (callCount === 1) return { count: 5 }; // source exists
              return { count: 0 }; // target doesn't exist
            }
            return null;
          }),
          run: vi.fn(async () => ({
            meta: { changes: 5, last_row_id: 0 },
          })),
        })),
      }));

      const { fetch } = createApp(db);

      const res = await fetch('/admin/categories/OldName', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newName: 'NewName' }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.oldName).toBe('OldName');
      expect(json.newName).toBe('NewName');
    });

    it('returns 404 when source category not found', async () => {
      const db = createMockDb({ countResult: { count: 0 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/categories/NonExistent', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newName: 'NewName' }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
    });

    it('returns 409 when target category already exists', async () => {
      let callCount = 0;
      const db = createMockDb({});
      (db as any).prepare = vi.fn((sql: string) => ({
        bind: vi.fn((..._args: unknown[]) => ({
          all: vi.fn(async () => ({ results: [] as any[] })),
          first: vi.fn(async () => {
            if (sql.includes('COUNT(*)')) {
              callCount++;
              if (callCount === 1) return { count: 5 }; // source exists
              return { count: 3 }; // target also exists
            }
            return null;
          }),
          run: vi.fn(async () => ({ meta: {} })),
        })),
      }));

      const { fetch } = createApp(db);

      const res = await fetch('/admin/categories/OldName', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newName: 'ExistingCategory' }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(409);
      expect(json.message).toContain('already exists');
    });

    it('returns 400 for missing newName', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/categories/OldName', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /admin/categories/:name', () => {
    it('deletes a category and moves products', async () => {
      let callCount = 0;
      const db = createMockDb({ deleteChanges: 5 });
      (db as any).prepare = vi.fn((sql: string) => ({
        bind: vi.fn((..._args: unknown[]) => ({
          all: vi.fn(async () => ({ results: [] as any[] })),
          first: vi.fn(async () => {
            if (sql.includes('COUNT(*)')) {
              return { count: 5 };
            }
            return null;
          }),
          run: vi.fn(async () => ({
            meta: { changes: 5, last_row_id: 0 },
          })),
        })),
      }));

      const { fetch } = createApp(db);

      const res = await fetch('/admin/categories/ToDelete', {
        method: 'DELETE',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ moveTo: 'OtherCategory' }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.deleted).toBe('ToDelete');
      expect(json.movedTo).toBe('OtherCategory');
    });

    it('returns 404 when category not found', async () => {
      const db = createMockDb({ countResult: { count: 0 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/categories/NonExistent', {
        method: 'DELETE',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
    });
  });
});
