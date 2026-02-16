import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cancelOrder } from '../../services/orderCancel';

// Mock orderEmail to avoid DB calls for email
vi.mock('../../services/orderEmail', () => ({
  sendOrderCancellationEmail: vi.fn().mockResolvedValue({ success: true }),
}));

import { sendOrderCancellationEmail } from '../../services/orderEmail';

// Mock global fetch for Stripe API calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

type QueryCall = { sql: string; bindings: unknown[] };

const ALL_ADMIN_PERMISSIONS = [
  { id: 'dashboard:read' }, { id: 'users:read' }, { id: 'users:write' }, { id: 'users:delete' },
  { id: 'orders:read' }, { id: 'orders:write' }, { id: 'products:read' }, { id: 'products:write' },
  { id: 'products:delete' }, { id: 'inventory:read' }, { id: 'inventory:write' },
  { id: 'inbox:read' }, { id: 'inbox:approve' }, { id: 'reports:read' }, { id: 'ledger:read' },
  { id: 'settings:read' }, { id: 'settings:write' }, { id: 'customers:read' }, { id: 'customers:write' },
  { id: 'tax-rates:read' }, { id: 'tax-rates:write' },
];

type MockDbOptions = {
  order?: { id: number; status: string; provider_payment_intent_id: string | null; customer_id: number | null } | null;
  orderItems?: Array<{ variant_id: number; quantity: number }>;
  updateChanges?: number;
};

const createMockDb = (options: MockDbOptions = {}) => {
  const calls: QueryCall[] = [];

  return {
    calls,
    prepare: (sql: string) => ({
      bind: (...bindings: unknown[]) => ({
        first: async () => {
          calls.push({ sql, bindings });
          if (sql.includes('FROM orders WHERE id')) {
            return options.order ?? null;
          }
          return null;
        },
        all: async () => {
          calls.push({ sql, bindings });
          if (sql.includes('FROM permissions') && sql.includes('role_permissions')) {
            return { results: ALL_ADMIN_PERMISSIONS };
          }
          if (sql.includes('FROM order_items')) {
            return { results: options.orderItems ?? [] };
          }
          return { results: [] };
        },
        run: async () => {
          calls.push({ sql, bindings });
          if (sql.includes('UPDATE orders SET status')) {
            return { meta: { changes: options.updateChanges ?? 1 } };
          }
          return { meta: { changes: 1 } };
        },
      }),
      all: async () => {
        calls.push({ sql, bind: [] });
        if (sql.includes('FROM permissions') && sql.includes('role_permissions')) {
          return { results: ALL_ADMIN_PERMISSIONS };
        }
        return { results: [] };
      },
      first: async () => {
        calls.push({ sql, bind: [] });
        return null;
      },
      run: async () => {
        calls.push({ sql, bind: [] });
        return { meta: { changes: 1 } };
      },
    }),
  };
};

describe('cancelOrder service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels a pending order successfully', async () => {
    const db = createMockDb({
      order: { id: 1, status: 'pending', provider_payment_intent_id: null, customer_id: 1 },
      orderItems: [{ variant_id: 10, quantity: 2 }],
    });

    const result = await cancelOrder({
      db: db as unknown as D1Database,
      env: { DB: db } as any,
      orderId: 1,
      reason: 'Customer changed mind',
      actor: 'admin',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.order.id).toBe(1);
      expect(result.order.status).toBe('cancelled');
      expect(result.stripeRefunded).toBe(false);
      expect(result.inventoryRestored).toBe(2);
    }

    // Verify inventory restoration was called
    const inventoryInsert = db.calls.find((c) => c.sql.includes('INSERT INTO inventory_movements'));
    expect(inventoryInsert).toBeDefined();
    expect(inventoryInsert?.bindings).toContain(10); // variant_id
    expect(inventoryInsert?.bindings).toContain(2); // quantity

    // Verify order status update
    const statusUpdate = db.calls.find((c) => c.sql.includes('UPDATE orders SET status'));
    expect(statusUpdate).toBeDefined();

    // Verify status history was recorded
    const statusHistory = db.calls.find((c) => c.sql.includes('INSERT INTO order_status_history'));
    expect(statusHistory).toBeDefined();

    // Verify audit log was recorded
    const auditLog = db.calls.find((c) => c.sql.includes('INSERT INTO audit_logs'));
    expect(auditLog).toBeDefined();
  });

  it('cancels a paid order with Stripe refund', async () => {
    const db = createMockDb({
      order: { id: 2, status: 'paid', provider_payment_intent_id: 'pi_test_123', customer_id: 1 },
      orderItems: [{ variant_id: 10, quantity: 1 }],
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'pi_test_123', status: 'canceled' }),
    });

    const result = await cancelOrder({
      db: db as unknown as D1Database,
      env: { DB: db } as any,
      orderId: 2,
      reason: 'Defective product',
      actor: 'admin',
      stripeSecretKey: 'sk_test_xxx',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.stripeRefunded).toBe(false); // cancel, not refund
    }

    // Verify Stripe cancel was called
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.stripe.com/v1/payment_intents/pi_test_123/cancel',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('falls back to refund when Stripe cancel fails (already captured)', async () => {
    const db = createMockDb({
      order: { id: 3, status: 'paid', provider_payment_intent_id: 'pi_test_456', customer_id: 1 },
      orderItems: [],
    });

    // First call: cancel fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { code: 'payment_intent_unexpected_state' } }),
    });
    // Second call: refund succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 're_test_789', status: 'succeeded' }),
    });

    const result = await cancelOrder({
      db: db as unknown as D1Database,
      env: { DB: db } as any,
      orderId: 3,
      reason: 'Customer request',
      actor: 'admin',
      stripeSecretKey: 'sk_test_xxx',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.stripeRefunded).toBe(true);
    }

    // Verify both Stripe calls were made
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://api.stripe.com/v1/refunds',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('returns 404 for non-existent order', async () => {
    const db = createMockDb({ order: null });

    const result = await cancelOrder({
      db: db as unknown as D1Database,
      env: { DB: db } as any,
      orderId: 999,
      reason: 'Test',
      actor: 'admin',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.error).toContain('not found');
    }
  });

  it('returns 400 for already cancelled order', async () => {
    const db = createMockDb({
      order: { id: 4, status: 'cancelled', provider_payment_intent_id: null, customer_id: 1 },
    });

    const result = await cancelOrder({
      db: db as unknown as D1Database,
      env: { DB: db } as any,
      orderId: 4,
      reason: 'Test',
      actor: 'admin',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toContain('cannot be cancelled');
    }
  });

  it('returns 400 for refunded order', async () => {
    const db = createMockDb({
      order: { id: 5, status: 'refunded', provider_payment_intent_id: null, customer_id: 1 },
    });

    const result = await cancelOrder({
      db: db as unknown as D1Database,
      env: { DB: db } as any,
      orderId: 5,
      reason: 'Test',
      actor: 'admin',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
    }
  });

  it('returns 409 on concurrent modification', async () => {
    const db = createMockDb({
      order: { id: 6, status: 'pending', provider_payment_intent_id: null, customer_id: 1 },
      orderItems: [],
      updateChanges: 0,
    });

    const result = await cancelOrder({
      db: db as unknown as D1Database,
      env: { DB: db } as any,
      orderId: 6,
      reason: 'Test',
      actor: 'admin',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toContain('concurrently');
    }
  });

  it('returns 500 when Stripe call fails completely', async () => {
    const db = createMockDb({
      order: { id: 7, status: 'paid', provider_payment_intent_id: 'pi_fail', customer_id: 1 },
      orderItems: [],
    });

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { code: 'some_other_error' } }),
    });

    const result = await cancelOrder({
      db: db as unknown as D1Database,
      env: { DB: db } as any,
      orderId: 7,
      reason: 'Test',
      actor: 'admin',
      stripeSecretKey: 'sk_test_xxx',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(500);
      expect(result.error).toContain('Stripe');
    }
  });

  it('restores inventory for multiple order items', async () => {
    const db = createMockDb({
      order: { id: 8, status: 'pending', provider_payment_intent_id: null, customer_id: 1 },
      orderItems: [
        { variant_id: 10, quantity: 3 },
        { variant_id: 20, quantity: 5 },
      ],
    });

    const result = await cancelOrder({
      db: db as unknown as D1Database,
      env: { DB: db } as any,
      orderId: 8,
      reason: 'Test',
      actor: 'admin',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.inventoryRestored).toBe(8);
    }

    // Verify two inventory movements were created
    const inventoryInserts = db.calls.filter((c) => c.sql.includes('INSERT INTO inventory_movements'));
    expect(inventoryInserts).toHaveLength(2);
  });

  it('skips Stripe cancellation for pending orders', async () => {
    const db = createMockDb({
      order: { id: 9, status: 'pending', provider_payment_intent_id: 'pi_test_999', customer_id: 1 },
      orderItems: [],
    });

    const result = await cancelOrder({
      db: db as unknown as D1Database,
      env: { DB: db } as any,
      orderId: 9,
      reason: 'Test',
      actor: 'admin',
      stripeSecretKey: 'sk_test_xxx',
    });

    expect(result.ok).toBe(true);
    // Stripe should NOT be called for pending orders
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
