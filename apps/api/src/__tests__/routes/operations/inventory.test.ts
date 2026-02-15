import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import inventory from '../../../routes/operations/inventory';

vi.mock('../../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
}));

vi.mock('../../../middleware/rbac', () => ({
  loadRbac: async (_c: any, next: any) => next(),
  requirePermission: () => async (_c: any, next: any) => next(),
}));

const ADMIN_KEY = 'test-admin-key';

const createMockDb = (options: {
  lowItems?: any[];
  inventoryRows?: any[];
  variant?: any | null;
  currentStock?: { on_hand: number } | null;
  insertResult?: { meta: { last_row_id: number; changes: number } };
  onHandAfter?: { on_hand: number } | null;
} = {}) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        all: vi.fn(async () => {
          if (sql.includes('inventory_thresholds') && sql.includes('HAVING')) {
            return { results: options.lowItems || [] };
          }
          if (sql.includes('FROM variants') && sql.includes('JOIN products')) {
            return { results: options.inventoryRows || [] };
          }
          return { results: [] };
        }),
        first: vi.fn(async () => {
          if (sql.includes('SELECT id FROM variants')) {
            return options.variant ?? null;
          }
          if (sql.includes('COALESCE(SUM(delta), 0) as on_hand')) {
            if (options.onHandAfter !== undefined && sql.includes('variant_id')) {
              return options.onHandAfter ?? { on_hand: 0 };
            }
            return options.currentStock ?? { on_hand: 10 };
          }
          return null;
        }),
        run: vi.fn(async () =>
          options.insertResult || { meta: { last_row_id: 1, changes: 1 } }
        ),
      })),
      all: vi.fn(async () => {
        if (sql.includes('FROM variants') && sql.includes('JOIN products')) {
          return { results: options.inventoryRows || [] };
        }
        return { results: [] };
      }),
    })),
  };
};

const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/', inventory);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, { DB: db, ADMIN_API_KEY: ADMIN_KEY } as any),
  };
};

// -------------------------------------------------
// GET /inventory/low
// -------------------------------------------------
describe('Inventory Routes', () => {
  describe('GET /inventory/low', () => {
    it('returns low stock items', async () => {
      const lowItems = [
        {
          variant_id: 1,
          on_hand: 2,
          threshold: 10,
          variant_title: 'Small',
          product_title: 'T-Shirt',
        },
        {
          variant_id: 3,
          on_hand: 0,
          threshold: 5,
          variant_title: 'Large',
          product_title: 'Hoodie',
        },
      ];

      const db = createMockDb({ lowItems });
      const { fetch } = createApp(db);

      const res = await fetch('/inventory/low');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.items).toHaveLength(2);
      expect(json.items[0].variant_id).toBe(1);
      expect(json.items[1].on_hand).toBe(0);
    });

    it('returns empty array when no items are low', async () => {
      const db = createMockDb({ lowItems: [] });
      const { fetch } = createApp(db);

      const res = await fetch('/inventory/low');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.items).toHaveLength(0);
    });

    it('respects limit query parameter', async () => {
      const db = createMockDb({ lowItems: [] });
      const { fetch } = createApp(db);

      await fetch('/inventory/low?limit=50');

      const prepareCall = db.prepare.mock.calls[0][0] as string;
      expect(prepareCall).toContain('LIMIT');
      const bindCall = db.prepare.mock.results[0].value.bind;
      expect(bindCall).toHaveBeenCalledWith(50);
    });

    it('clamps limit between 1 and 200', async () => {
      const db = createMockDb({ lowItems: [] });
      const { fetch } = createApp(db);

      await fetch('/inventory/low?limit=999');

      const bindCall = db.prepare.mock.results[0].value.bind;
      expect(bindCall).toHaveBeenCalledWith(200);
    });
  });

  // -------------------------------------------------
  // POST /inventory/thresholds
  // -------------------------------------------------
  describe('POST /inventory/thresholds', () => {
    it('upserts a threshold successfully', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/inventory/thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant_id: 1, threshold: 10 }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.variant_id).toBe(1);
      expect(json.threshold).toBe(10);
    });

    it('returns 400 for missing variant_id', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/inventory/thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: 10 }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
    });

    it('returns 400 for negative threshold', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/inventory/thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant_id: 1, threshold: -5 }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
    });

    it('returns 400 for non-integer variant_id', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/inventory/thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant_id: 1.5, threshold: 10 }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
    });
  });

  // -------------------------------------------------
  // GET /admin/inventory
  // -------------------------------------------------
  describe('GET /admin/inventory', () => {
    it('returns all variants with inventory status', async () => {
      const inventoryRows = [
        {
          variant_id: 1,
          variant_title: 'Small',
          product_id: 1,
          product_title: 'T-Shirt',
          sku: 'TS-S',
          on_hand: 20,
          threshold: 5,
        },
        {
          variant_id: 2,
          variant_title: 'Medium',
          product_id: 1,
          product_title: 'T-Shirt',
          sku: 'TS-M',
          on_hand: 3,
          threshold: 10,
        },
        {
          variant_id: 3,
          variant_title: 'Large',
          product_id: 2,
          product_title: 'Hoodie',
          sku: null,
          on_hand: 0,
          threshold: 5,
        },
      ];

      const db = createMockDb({ inventoryRows });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inventory', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.inventory).toHaveLength(3);
      expect(json.inventory[0].status).toBe('ok');
      expect(json.inventory[1].status).toBe('low');
      expect(json.inventory[2].status).toBe('out');
      expect(json.meta.totalCount).toBe(3);
    });

    it('returns empty inventory list', async () => {
      const db = createMockDb({ inventoryRows: [] });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inventory', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.inventory).toHaveLength(0);
      expect(json.meta.totalCount).toBe(0);
    });

    it('sets status to ok when threshold is null', async () => {
      const inventoryRows = [
        {
          variant_id: 1,
          variant_title: 'Small',
          product_id: 1,
          product_title: 'T-Shirt',
          sku: 'TS-S',
          on_hand: 3,
          threshold: null,
        },
      ];

      const db = createMockDb({ inventoryRows });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inventory', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.inventory[0].status).toBe('ok');
    });
  });

  // -------------------------------------------------
  // POST /admin/inventory/movements
  // -------------------------------------------------
  describe('POST /admin/inventory/movements', () => {
    it('records a positive movement (restock)', async () => {
      const db = createMockDb({
        variant: { id: 1 },
        insertResult: { meta: { last_row_id: 42, changes: 1 } },
        onHandAfter: { on_hand: 30 },
      });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inventory/movements', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variant_id: 1,
          delta: 20,
          reason: 'restock',
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.movement.id).toBe(42);
      expect(json.movement.variant_id).toBe(1);
      expect(json.movement.delta).toBe(20);
      expect(json.movement.reason).toBe('restock');
    });

    it('records a negative movement (sale)', async () => {
      const db = createMockDb({
        variant: { id: 1 },
        currentStock: { on_hand: 10 },
        insertResult: { meta: { last_row_id: 43, changes: 1 } },
        onHandAfter: { on_hand: 7 },
      });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inventory/movements', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variant_id: 1,
          delta: -3,
          reason: 'sale',
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.movement.delta).toBe(-3);
    });

    it('returns 404 when variant does not exist', async () => {
      const db = createMockDb({ variant: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inventory/movements', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variant_id: 999,
          delta: 5,
          reason: 'restock',
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Variant not found');
    });

    it('returns 400 for insufficient stock on negative delta', async () => {
      const db = createMockDb({
        variant: { id: 1 },
        currentStock: { on_hand: 3 },
      });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inventory/movements', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variant_id: 1,
          delta: -10,
          reason: 'sale',
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Insufficient stock');
    });

    it('returns 400 for invalid reason', async () => {
      const db = createMockDb({ variant: { id: 1 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inventory/movements', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variant_id: 1,
          delta: 5,
          reason: 'invalid_reason',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for missing required fields', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inventory/movements', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ variant_id: 1 }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for non-integer delta', async () => {
      const db = createMockDb({ variant: { id: 1 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inventory/movements', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variant_id: 1,
          delta: 2.5,
          reason: 'restock',
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------
  // PUT /admin/inventory/thresholds/:variantId
  // -------------------------------------------------
  describe('PUT /admin/inventory/thresholds/:variantId', () => {
    it('updates threshold for existing variant', async () => {
      const db = createMockDb({ variant: { id: 5 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inventory/thresholds/5', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ threshold: 15 }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.variant_id).toBe(5);
      expect(json.threshold).toBe(15);
    });

    it('returns 404 when variant does not exist', async () => {
      const db = createMockDb({ variant: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inventory/thresholds/999', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ threshold: 10 }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Variant not found');
    });

    it('returns 400 for invalid variantId param', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inventory/thresholds/abc', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ threshold: 10 }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for negative threshold', async () => {
      const db = createMockDb({ variant: { id: 1 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inventory/thresholds/1', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ threshold: -5 }),
      });

      expect(res.status).toBe(400);
    });

    it('allows threshold of zero', async () => {
      const db = createMockDb({ variant: { id: 1 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/inventory/thresholds/1', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ threshold: 0 }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.threshold).toBe(0);
    });
  });
});
