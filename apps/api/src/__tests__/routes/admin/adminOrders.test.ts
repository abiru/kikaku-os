import { describe, it, expect } from 'vitest';
import worker from '../../../index';

const ALL_ADMIN_PERMISSIONS = [
  { id: 'dashboard:read' }, { id: 'users:read' }, { id: 'users:write' }, { id: 'users:delete' },
  { id: 'orders:read' }, { id: 'orders:write' }, { id: 'products:read' }, { id: 'products:write' },
  { id: 'products:delete' }, { id: 'inventory:read' }, { id: 'inventory:write' },
  { id: 'inbox:read' }, { id: 'inbox:approve' }, { id: 'reports:read' }, { id: 'ledger:read' },
  { id: 'settings:read' }, { id: 'settings:write' }, { id: 'customers:read' }, { id: 'customers:write' },
  { id: 'tax-rates:read' }, { id: 'tax-rates:write' },
];

type OrderRow = {
  id: number;
  status: string;
  total_net: number;
  currency: string;
  created_at: string;
  paid_at: string | null;
  customer_email: string | null;
  fulfillment_status: string | null;
  payment_count: number;
};

type OrderDetail = {
  id: number;
  status: string;
  total_net: number;
  total_fee: number;
  currency: string;
  customer_id: number | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  customer_email: string | null;
  customer_name: string | null;
};

const createMockEnv = (options: {
  orders?: OrderRow[];
  orderDetail?: OrderDetail | null;
  payments?: any[];
  refunds?: any[];
  stripeEvents?: any[];
  fulfillments?: any[];
  totalCount?: number;
} = {}) => {
  const calls: { sql: string; bind: unknown[] }[] = [];

  const createQueryBuilder = (sql: string) => ({
    bind: (...args: unknown[]) => {
      calls.push({ sql, bind: args });
      return createQueryBuilder(sql);
    },
    first: async () => {
      if (sql.includes('COUNT(*)')) {
        return { count: options.totalCount ?? (options.orders?.length ?? 0) };
      }
      // Order detail
      if (sql.includes('FROM orders o') && sql.includes('WHERE o.id = ?')) {
        return options.orderDetail ?? null;
      }
      return null;
    },
    all: async () => {
      // RBAC permissions
      if (sql.includes('FROM permissions') && sql.includes('role_permissions')) {
        return { results: ALL_ADMIN_PERMISSIONS };
      }
      // Order list
      if (sql.includes('FROM orders o') && sql.includes('LIMIT ?')) {
        return { results: options.orders || [] };
      }
      // Payments
      if (sql.includes('FROM payments') && !sql.includes('refunds')) {
        return { results: options.payments || [] };
      }
      // Refunds
      if (sql.includes('FROM refunds')) {
        return { results: options.refunds || [] };
      }
      // Stripe events
      if (sql.includes('FROM stripe_events')) {
        return { results: options.stripeEvents || [] };
      }
      // Fulfillments
      if (sql.includes('FROM fulfillments')) {
        return { results: options.fulfillments || [] };
      }
      return { results: [] };
    },
    run: async () => ({ meta: { last_row_id: 1 } }),
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

describe('GET /admin/orders', () => {
  it('returns paginated order list', async () => {
    const orders: OrderRow[] = [
      {
        id: 101,
        status: 'paid',
        total_net: 5000,
        currency: 'JPY',
        created_at: '2026-01-15T10:00:00Z',
        paid_at: '2026-01-15T10:01:00Z',
        customer_email: 'buyer@example.com',
        fulfillment_status: 'pending',
        payment_count: 1,
      },
      {
        id: 102,
        status: 'pending',
        total_net: 3000,
        currency: 'JPY',
        created_at: '2026-01-15T11:00:00Z',
        paid_at: null,
        customer_email: 'another@example.com',
        fulfillment_status: null,
        payment_count: 0,
      },
    ];

    const { env } = createMockEnv({ orders, totalCount: 2 });

    const res = await worker.fetch(
      new Request('http://localhost/admin/orders?page=1&perPage=20', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' },
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(json.orders).toHaveLength(2);
    expect(json.meta.page).toBe(1);
    expect(json.meta.totalCount).toBe(2);
  });

  it('returns empty list when no orders exist', async () => {
    const { env } = createMockEnv({ orders: [], totalCount: 0 });

    const res = await worker.fetch(
      new Request('http://localhost/admin/orders', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' },
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(json.orders).toHaveLength(0);
    expect(json.meta.totalCount).toBe(0);
  });

  it('supports search query parameter', async () => {
    const orders: OrderRow[] = [
      {
        id: 101,
        status: 'paid',
        total_net: 5000,
        currency: 'JPY',
        created_at: '2026-01-15T10:00:00Z',
        paid_at: '2026-01-15T10:01:00Z',
        customer_email: 'specific@example.com',
        fulfillment_status: null,
        payment_count: 1,
      },
    ];

    const { env } = createMockEnv({ orders, totalCount: 1 });

    const res = await worker.fetch(
      new Request('http://localhost/admin/orders?q=specific', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' },
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(json.orders).toHaveLength(1);
  });

  it('returns 401 without admin key', async () => {
    const { env } = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/orders', {
        method: 'GET',
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(401);
  });
});

describe('GET /admin/orders/:id', () => {
  it('returns order detail with related data', async () => {
    const orderDetail: OrderDetail = {
      id: 101,
      status: 'paid',
      total_net: 5000,
      total_fee: 200,
      currency: 'JPY',
      customer_id: 1,
      paid_at: '2026-01-15T10:01:00Z',
      created_at: '2026-01-15T10:00:00Z',
      updated_at: '2026-01-15T10:01:00Z',
      customer_email: 'buyer@example.com',
      customer_name: 'Test Buyer',
    };

    const payments = [
      {
        id: 1,
        status: 'succeeded',
        amount: 5000,
        fee: 200,
        currency: 'JPY',
        provider: 'stripe',
        provider_payment_id: 'pi_test123',
        created_at: '2026-01-15T10:01:00Z',
      },
    ];

    const fulfillments = [
      {
        id: 1,
        status: 'pending',
        tracking_number: null,
        created_at: '2026-01-15T10:02:00Z',
        updated_at: '2026-01-15T10:02:00Z',
      },
    ];

    const { env } = createMockEnv({
      orderDetail,
      payments,
      fulfillments,
      refunds: [],
      stripeEvents: [],
    });

    const res = await worker.fetch(
      new Request('http://localhost/admin/orders/101', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' },
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.ok).toBe(true);
    expect(json.order.id).toBe(101);
    expect(json.order.customer_email).toBe('buyer@example.com');
    expect(json.payments).toHaveLength(1);
    expect(json.fulfillments).toHaveLength(1);
    expect(json.refunds).toHaveLength(0);
  });

  it('returns 404 for non-existent order', async () => {
    const { env } = createMockEnv({ orderDetail: null });

    const res = await worker.fetch(
      new Request('http://localhost/admin/orders/999', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' },
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(404);
    const json = await res.json<any>();
    expect(json.ok).toBe(false);
    expect(json.message).toContain('not found');
  });

  it('returns 400 for invalid order id', async () => {
    const { env } = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/orders/abc', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-admin-key' },
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(400);
  });

  it('returns 401 without admin key', async () => {
    const { env } = createMockEnv();

    const res = await worker.fetch(
      new Request('http://localhost/admin/orders/101', {
        method: 'GET',
      }),
      env as any,
      createCtx() as any
    );

    expect(res.status).toBe(401);
  });
});
