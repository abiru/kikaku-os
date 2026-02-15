import { describe, it, expect, vi } from 'vitest';
import worker from '../../../index';

const ALL_ADMIN_PERMISSIONS = [
  { id: 'dashboard:read' }, { id: 'users:read' }, { id: 'users:write' }, { id: 'users:delete' },
  { id: 'orders:read' }, { id: 'orders:write' }, { id: 'products:read' }, { id: 'products:write' },
  { id: 'products:delete' }, { id: 'inventory:read' }, { id: 'inventory:write' },
  { id: 'inbox:read' }, { id: 'inbox:approve' }, { id: 'reports:read' }, { id: 'ledger:read' },
  { id: 'settings:read' }, { id: 'settings:write' }, { id: 'customers:read' }, { id: 'customers:write' },
  { id: 'tax-rates:read' }, { id: 'tax-rates:write' },
];

type LowInventoryItem = {
  variant_id: number;
  on_hand: number;
  threshold: number;
  variant_title: string | null;
  product_title: string | null;
};

const createMockEnv = (options: {
  lowItems?: LowInventoryItem[];
  inventoryRows?: any[];
  variantExists?: boolean;
  currentStock?: number;
} = {}) => {
  const calls: { sql: string; bind: unknown[] }[] = [];

  const createQueryBuilder = (sql: string) => ({
    bind: (...args: unknown[]) => {
      calls.push({ sql, bind: args });
      return createQueryBuilder(sql);
    },
    first: async () => {
      // Variant existence check
      if (sql.includes('SELECT id FROM variants')) {
        return options.variantExists !== false ? { id: 1 } : null;
      }
      // Current stock check
      if (sql.includes('SUM(delta)') && sql.includes('inventory_movements')) {
        return { on_hand: options.currentStock ?? 10 };
      }
      return null;
    },
    all: async () => {
      // RBAC permissions
      if (sql.includes('FROM permissions') && sql.includes('role_permissions')) {
        return { results: ALL_ADMIN_PERMISSIONS };
      }
      // Low inventory items
      if (sql.includes('inventory_thresholds') && sql.includes('HAVING')) {
        return { results: options.lowItems || [] };
      }
      // Admin inventory list
      if (sql.includes('FROM variants v') && sql.includes('JOIN products p')) {
        return { results: options.inventoryRows || [] };
      }
      return { results: [] };
    },
    run: async () => ({ meta: { last_row_id: 1, changes: 1 } }),
  });

  return {
    calls,
    env: {
      DB: {
        prepare: (sql: string) => createQueryBuilder(sql),
      },
      ADMIN_API_KEY: 'test-admin-key',
    },
  };
};

const createCtx = () => ({
  waitUntil: () => {},
  passThroughOnException: () => {},
});

describe('GET /inventory/low', () => {
  it('returns low inventory items', async () => {
    const lowItems: LowInventoryItem[] = [
      {
        variant_id: 1,
        on_hand: 2,
        threshold: 10,
        variant_title: 'Small Size',
        product_title: 'T-Shirt',
      },
      {
        variant_id: 2,
        on_hand: 0,
        threshold: 5,
        variant_title: 'Large Size',
        product_title: 'T-Shirt',
      },
    ];

    const { env } = createMockEnv({ lowItems });

    const res = await worker.fetch(
      new Request('http://localhost/inventory/low', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' },
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(json.items).toHaveLength(2);
    expect(json.items[0].variant_id).toBe(1);
    expect(json.items[0].on_hand).toBe(2);
    expect(json.items[0].threshold).toBe(10);
  });

  it('returns empty list when no low inventory', async () => {
    const { env } = createMockEnv({ lowItems: [] });

    const res = await worker.fetch(
      new Request('http://localhost/inventory/low', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' },
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(json.items).toHaveLength(0);
  });

  it('respects limit parameter', async () => {
    const { env, calls } = createMockEnv({ lowItems: [] });

    await worker.fetch(
      new Request('http://localhost/inventory/low?limit=50', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' },
      }),
      env as any,
      createCtx() as any
    );

    const inventoryQuery = calls.find((c) =>
      c.sql.includes('inventory_thresholds') && c.sql.includes('LIMIT')
    );
    expect(inventoryQuery).toBeDefined();
    expect(inventoryQuery?.bind).toContain(50);
  });

  it('clamps limit to maximum of 200', async () => {
    const { env, calls } = createMockEnv({ lowItems: [] });

    await worker.fetch(
      new Request('http://localhost/inventory/low?limit=500', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' },
      }),
      env as any,
      createCtx() as any
    );

    const inventoryQuery = calls.find((c) =>
      c.sql.includes('inventory_thresholds') && c.sql.includes('LIMIT')
    );
    expect(inventoryQuery).toBeDefined();
    expect(inventoryQuery?.bind).toContain(200);
  });
});

describe('POST /inventory/thresholds', () => {
  it('creates a threshold for a variant', async () => {
    const { env } = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/inventory/thresholds', {
        method: 'POST',
        headers: {
          'x-admin-key': 'test-admin-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variant_id: 1,
          threshold: 10,
        }),
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(json.variant_id).toBe(1);
    expect(json.threshold).toBe(10);
  });

  it('returns 400 for missing variant_id', async () => {
    const { env } = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/inventory/thresholds', {
        method: 'POST',
        headers: {
          'x-admin-key': 'test-admin-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          threshold: 10,
        }),
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(400);
    const json = await res.json<any>();
    expect(json.ok).toBe(false);
  });

  it('returns 400 for negative threshold', async () => {
    const { env } = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/inventory/thresholds', {
        method: 'POST',
        headers: {
          'x-admin-key': 'test-admin-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variant_id: 1,
          threshold: -5,
        }),
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(400);
  });

  it('returns 400 for missing threshold', async () => {
    const { env } = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/inventory/thresholds', {
        method: 'POST',
        headers: {
          'x-admin-key': 'test-admin-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variant_id: 1,
        }),
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(400);
  });
});

describe('GET /admin/inventory', () => {
  it('returns inventory list with stock status', async () => {
    const inventoryRows = [
      {
        variant_id: 1,
        variant_title: 'Small',
        product_id: 1,
        product_title: 'T-Shirt',
        sku: 'TSH-S',
        on_hand: 20,
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
        product_id: 1,
        product_title: 'T-Shirt',
        sku: 'TSH-M',
        on_hand: 0,
        threshold: 5,
      },
    ];

    const { env } = createMockEnv({ inventoryRows });

    const res = await worker.fetch(
      new Request('http://localhost/admin/inventory', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' },
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(json.inventory).toHaveLength(3);
    expect(json.inventory[0].status).toBe('ok');
    expect(json.inventory[1].status).toBe('low');
    expect(json.inventory[2].status).toBe('out');
    expect(json.meta.totalCount).toBe(3);
  });

  it('returns empty inventory list', async () => {
    const { env } = createMockEnv({ inventoryRows: [] });

    const res = await worker.fetch(
      new Request('http://localhost/admin/inventory', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' },
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(json.inventory).toHaveLength(0);
  });

  it('returns 401 without admin key', async () => {
    const { env } = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/inventory', {
        method: 'GET',
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(401);
  });
});

describe('POST /admin/inventory/movements', () => {
  it('records a positive inventory movement', async () => {
    const { env } = createMockEnv({ variantExists: true, currentStock: 10 });

    const res = await worker.fetch(
      new Request('http://localhost/admin/inventory/movements', {
        method: 'POST',
        headers: {
          'x-admin-key': 'test-admin-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variant_id: 1,
          delta: 5,
          reason: 'restock',
        }),
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(json.movement).toBeDefined();
    expect(json.movement.variant_id).toBe(1);
    expect(json.movement.delta).toBe(5);
    expect(json.movement.reason).toBe('restock');
  });

  it('records a negative inventory movement', async () => {
    const { env } = createMockEnv({ variantExists: true, currentStock: 10 });

    const res = await worker.fetch(
      new Request('http://localhost/admin/inventory/movements', {
        method: 'POST',
        headers: {
          'x-admin-key': 'test-admin-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variant_id: 1,
          delta: -3,
          reason: 'sale',
        }),
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(json.movement.delta).toBe(-3);
  });

  it('returns 404 for non-existent variant', async () => {
    const { env } = createMockEnv({ variantExists: false });

    const res = await worker.fetch(
      new Request('http://localhost/admin/inventory/movements', {
        method: 'POST',
        headers: {
          'x-admin-key': 'test-admin-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variant_id: 999,
          delta: 5,
          reason: 'restock',
        }),
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(404);
    const json = await res.json<any>();
    expect(json.ok).toBe(false);
    expect(json.message).toContain('Variant not found');
  });

  it('returns 400 for insufficient stock on negative movement', async () => {
    const { env } = createMockEnv({ variantExists: true, currentStock: 2 });

    const res = await worker.fetch(
      new Request('http://localhost/admin/inventory/movements', {
        method: 'POST',
        headers: {
          'x-admin-key': 'test-admin-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variant_id: 1,
          delta: -5,
          reason: 'sale',
        }),
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(400);
    const json = await res.json<any>();
    expect(json.ok).toBe(false);
    expect(json.message).toContain('Insufficient stock');
  });

  it('returns 400 for missing required fields', async () => {
    const { env } = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/inventory/movements', {
        method: 'POST',
        headers: {
          'x-admin-key': 'test-admin-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variant_id: 1,
        }),
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(400);
  });
});
