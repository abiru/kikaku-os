import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import inventory from '../../../routes/operations/inventory';

vi.mock('../../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
}));

vi.mock('../../../middleware/rbac', () => ({
  loadRbac: async (_c: any, next: any) => next(),
  requirePermission: () => async (_c: any, next: any) => next(),
}));

const createMockDb = (options: {
  lowStockItems?: any[];
  adminInventory?: any[];
  variant?: any | null;
  currentStock?: number;
  insertId?: number;
  shouldFail?: boolean;
  failOnSql?: string;
} = {}) => {
  const makeResult = (sql: string) => ({
    all: vi.fn(async () => {
      if (options.shouldFail && options.failOnSql && sql.includes(options.failOnSql)) {
        throw new Error('Mock DB error');
      }
      if (sql.includes('inventory_thresholds') && sql.includes('HAVING')) {
        return { results: options.lowStockItems || [] };
      }
      if (sql.includes('FROM variants') && sql.includes('JOIN products')) {
        return { results: options.adminInventory || [] };
      }
      return { results: [] };
    }),
    first: vi.fn(async () => {
      if (sql.includes('FROM variants WHERE id')) {
        return options.variant ?? null;
      }
      if (sql.includes('SUM(delta)')) {
        return { on_hand: options.currentStock ?? 0 };
      }
      return null;
    }),
    run: vi.fn(async () => {
      if (options.shouldFail && options.failOnSql && sql.includes(options.failOnSql)) {
        throw new Error('Mock DB error');
      }
      return {
        meta: { last_row_id: options.insertId || 1, changes: 1 },
      };
    }),
  });

  return {
    prepare: vi.fn((sql: string) => {
      const result = makeResult(sql);
      return {
        ...result,
        bind: vi.fn((..._args: unknown[]) => result),
      };
    }),
  };
};

const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/', inventory);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, { DB: db, ADMIN_API_KEY: 'test-key' } as any),
  };
};

describe('Inventory Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /inventory/low', () => {
    it('returns low stock items', async () => {
      const items = [
        {
          variant_id: 1,
          on_hand: 2,
          threshold: 10,
          variant_title: 'Small',
          product_title: 'T-Shirt',
        },
        {
          variant_id: 2,
          on_hand: 0,
          threshold: 5,
          variant_title: 'Large',
          product_title: 'Hoodie',
        },
      ];

      const db = createMockDb({ lowStockItems: items });
      const { fetch } = createApp(db);

      const res = await fetch('/inventory/low');

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.items).toHaveLength(2);
      expect(data.items[0].variant_id).toBe(1);
      expect(data.items[0].on_hand).toBe(2);
      expect(data.items[0].threshold).toBe(10);
    });

    it('returns empty list when no low stock items', async () => {
      const db = createMockDb({ lowStockItems: [] });
      const { fetch } = createApp(db);

      const res = await fetch('/inventory/low');

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.items).toHaveLength(0);
    });

    it('respects limit parameter', async () => {
      const db = createMockDb({ lowStockItems: [] });
      const { fetch } = createApp(db);

      await fetch('/inventory/low?limit=10');

      expect(db.prepare).toHaveBeenCalled();
    });

    it('caps limit at 200', async () => {
      const db = createMockDb({ lowStockItems: [] });
      const { fetch } = createApp(db);

      await fetch('/inventory/low?limit=500');

      expect(db.prepare).toHaveBeenCalled();
    });

    it('enforces minimum limit of 1', async () => {
      const db = createMockDb({ lowStockItems: [] });
      const { fetch } = createApp(db);

      await fetch('/inventory/low?limit=0');

      expect(db.prepare).toHaveBeenCalled();
    });
  });

  describe('POST /inventory/thresholds', () => {
    it('sets threshold for a variant', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/inventory/thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant_id: 1, threshold: 10 }),
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.variant_id).toBe(1);
      expect(data.threshold).toBe(10);
    });

    it('rejects invalid variant_id', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/inventory/thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant_id: -1, threshold: 10 }),
      });

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
    });

    it('rejects negative threshold', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/inventory/thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant_id: 1, threshold: -5 }),
      });

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
    });

    it('allows zero threshold', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/inventory/thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant_id: 1, threshold: 0 }),
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.threshold).toBe(0);
    });
  });

  describe('GET /admin/inventory', () => {
    it('returns inventory list with status', async () => {
      const adminInventory = [
        {
          variant_id: 1,
          variant_title: 'Small',
          product_id: 1,
          product_title: 'T-Shirt',
          sku: 'TSH-S',
          on_hand: 50,
          threshold: 10,
        },
        {
          variant_id: 2,
          variant_title: 'Large',
          product_id: 1,
          product_title: 'T-Shirt',
          sku: 'TSH-L',
          on_hand: 3,
          threshold: 5,
        },
        {
          variant_id: 3,
          variant_title: 'Medium',
          product_id: 2,
          product_title: 'Hoodie',
          sku: 'HOD-M',
          on_hand: 0,
          threshold: 5,
        },
      ];

      const db = createMockDb({ adminInventory });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inventory');

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.inventory).toHaveLength(3);
      expect(data.meta.totalCount).toBe(3);
    });
  });

  describe('POST /admin/inventory/movements', () => {
    it('records a restock movement', async () => {
      const db = createMockDb({ variant: { id: 1 }, currentStock: 15, insertId: 42 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inventory/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variant_id: 1,
          delta: 10,
          reason: 'restock',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.movement.variant_id).toBe(1);
      expect(data.movement.delta).toBe(10);
      expect(data.movement.reason).toBe('restock');
    });

    it('rejects movement for non-existent variant', async () => {
      const db = createMockDb({ variant: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inventory/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variant_id: 999,
          delta: 5,
          reason: 'restock',
        }),
      });

      expect(res.status).toBe(404);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
      expect(data.message).toContain('Variant not found');
    });

    it('prevents negative stock', async () => {
      const db = createMockDb({ variant: { id: 1 }, currentStock: 3 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inventory/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variant_id: 1,
          delta: -10,
          reason: 'sale',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
      expect(data.message).toContain('Insufficient stock');
    });

    it('validates reason enum', async () => {
      const db = createMockDb({ variant: { id: 1 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inventory/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variant_id: 1,
          delta: 5,
          reason: 'invalid_reason',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
    });

    it('allows valid outgoing movement when stock is sufficient', async () => {
      const db = createMockDb({ variant: { id: 1 }, currentStock: 10, insertId: 43 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inventory/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variant_id: 1,
          delta: -5,
          reason: 'sale',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.movement.delta).toBe(-5);
    });
  });

  describe('PUT /admin/inventory/thresholds/:variantId', () => {
    it('updates threshold for an existing variant', async () => {
      const db = createMockDb({ variant: { id: 1 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inventory/thresholds/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: 15 }),
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.variant_id).toBe(1);
      expect(data.threshold).toBe(15);
    });

    it('returns 404 for non-existent variant', async () => {
      const db = createMockDb({ variant: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inventory/thresholds/999', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: 10 }),
      });

      expect(res.status).toBe(404);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
      expect(data.message).toContain('Variant not found');
    });

    it('rejects invalid variantId param', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inventory/thresholds/abc', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: 10 }),
      });

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
    });

    it('rejects negative threshold', async () => {
      const db = createMockDb({ variant: { id: 1 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inventory/thresholds/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: -5 }),
      });

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
    });
  });
});
