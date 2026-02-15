import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../../../index';

// Mock global fetch for Stripe API calls
const originalFetch = globalThis.fetch;
const mockStripeFetch = vi.fn();

const ALL_ADMIN_PERMISSIONS = [
  { id: 'dashboard:read' }, { id: 'users:read' }, { id: 'users:write' }, { id: 'users:delete' },
  { id: 'orders:read' }, { id: 'orders:write' }, { id: 'products:read' }, { id: 'products:write' },
  { id: 'products:delete' }, { id: 'inventory:read' }, { id: 'inventory:write' },
  { id: 'inbox:read' }, { id: 'inbox:approve' }, { id: 'reports:read' }, { id: 'ledger:read' },
  { id: 'settings:read' }, { id: 'settings:write' }, { id: 'customers:read' }, { id: 'customers:write' },
  { id: 'tax-rates:read' }, { id: 'tax-rates:write' },
];

type QueryCall = { sql: string; bindings: unknown[] };

type MockDbConfig = {
  order?: {
    id: number;
    status: string;
    provider_payment_intent_id: string | null;
    customer_id: number | null;
  } | null;
  orderItems?: Array<{ variant_id: number; quantity: number }>;
  updateChanges?: number;
};

const createMockDb = (config: MockDbConfig = {}) => {
  const calls: QueryCall[] = [];

  return {
    calls,
    prepare: (sql: string) => {
      const handler = {
        bind: (...bindings: unknown[]) => ({
          first: async () => {
            calls.push({ sql, bindings });
            if (sql.includes('FROM orders WHERE id')) {
              return config.order ?? null;
            }
            return null;
          },
          all: async () => {
            calls.push({ sql, bindings });
            if (sql.includes('FROM permissions') && sql.includes('role_permissions')) {
              return { results: ALL_ADMIN_PERMISSIONS };
            }
            if (sql.includes('FROM order_items')) {
              return { results: config.orderItems ?? [] };
            }
            return { results: [] };
          },
          run: async () => {
            calls.push({ sql, bindings });
            if (sql.includes('UPDATE orders SET status')) {
              return { meta: { changes: config.updateChanges ?? 1 } };
            }
            return { meta: { changes: 1 } };
          },
        }),
        all: async () => {
          calls.push({ sql, bindings: [] });
          if (sql.includes('FROM permissions') && sql.includes('role_permissions')) {
            return { results: ALL_ADMIN_PERMISSIONS };
          }
          return { results: [] };
        },
        first: async () => {
          calls.push({ sql, bindings: [] });
          return null;
        },
        run: async () => {
          calls.push({ sql, bindings: [] });
          return { meta: { changes: 1 } };
        },
      };
      return handler;
    },
  };
};

const makeRequest = (orderId: number, body: Record<string, unknown>, db: ReturnType<typeof createMockDb>) =>
  worker.fetch(
    new Request(`http://localhost/admin/orders/${orderId}/cancel`, {
      method: 'POST',
      headers: {
        'x-admin-key': 'test-admin-key',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    }),
    { DB: db, ADMIN_API_KEY: 'test-admin-key', STRIPE_SECRET_KEY: 'sk_test_xxx' } as unknown as Record<string, unknown>,
    { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
  );

describe('POST /admin/orders/:id/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Intercept Stripe API calls while allowing Hono internal fetch
    vi.stubGlobal('fetch', (...args: Parameters<typeof fetch>) => {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
      if (url.includes('api.stripe.com')) {
        return mockStripeFetch(...args);
      }
      return originalFetch(...args);
    });
  });

  it('cancels a pending order successfully', async () => {
    const db = createMockDb({
      order: { id: 1, status: 'pending', provider_payment_intent_id: null, customer_id: 1 },
      orderItems: [{ variant_id: 10, quantity: 2 }],
    });

    const res = await makeRequest(1, { reason: 'Customer changed mind' }, db);

    expect(res.status).toBe(200);
    const json = await res.json() as Record<string, unknown>;
    expect(json.ok).toBe(true);
    expect(json.stripeRefunded).toBe(false);
    expect(json.inventoryRestored).toBe(2);
  });

  it('cancels a paid order with Stripe cancellation', async () => {
    const db = createMockDb({
      order: { id: 2, status: 'paid', provider_payment_intent_id: 'pi_test_123', customer_id: 1 },
      orderItems: [{ variant_id: 10, quantity: 1 }],
    });

    mockStripeFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'pi_test_123', status: 'canceled' }),
    });

    const res = await makeRequest(2, { reason: 'Defective product' }, db);

    expect(res.status).toBe(200);
    const json = await res.json() as Record<string, unknown>;
    expect(json.ok).toBe(true);
  });

  it('returns 404 for non-existent order', async () => {
    const db = createMockDb({ order: null });

    const res = await makeRequest(999, { reason: 'Test' }, db);

    expect(res.status).toBe(404);
    const json = await res.json() as Record<string, unknown>;
    expect(json.ok).toBe(false);
  });

  it('returns 400 for already cancelled order', async () => {
    const db = createMockDb({
      order: { id: 3, status: 'cancelled', provider_payment_intent_id: null, customer_id: 1 },
    });

    const res = await makeRequest(3, { reason: 'Test' }, db);

    expect(res.status).toBe(400);
    const json = await res.json() as Record<string, unknown>;
    expect(json.ok).toBe(false);
    expect(json.message).toContain('cannot be cancelled');
  });

  it('returns 400 when reason is missing', async () => {
    const db = createMockDb({
      order: { id: 4, status: 'pending', provider_payment_intent_id: null, customer_id: 1 },
    });

    const res = await worker.fetch(
      new Request('http://localhost/admin/orders/4/cancel', {
        method: 'POST',
        headers: {
          'x-admin-key': 'test-admin-key',
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      }),
      { DB: db, ADMIN_API_KEY: 'test-admin-key', STRIPE_SECRET_KEY: 'sk_test_xxx' } as unknown as Record<string, unknown>,
      { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
    );

    expect(res.status).toBe(400);
    const json = await res.json() as Record<string, unknown>;
    expect(json.ok).toBe(false);
  });

  it('returns 401 without auth', async () => {
    const db = createMockDb();

    const res = await worker.fetch(
      new Request('http://localhost/admin/orders/1/cancel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'Test' }),
      }),
      { DB: db, ADMIN_API_KEY: 'test-admin-key' } as unknown as Record<string, unknown>,
      { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
    );

    expect(res.status).toBe(401);
  });
});
