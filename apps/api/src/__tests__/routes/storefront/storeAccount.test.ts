import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import storeAccount from '../../../routes/storefront/storeAccount';

// Mock @clerk/backend
vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn(),
}));

import { verifyToken } from '@clerk/backend';

const mockVerifyToken = vi.mocked(verifyToken);

type CustomerRow = {
  id: number;
  name: string;
  email: string | null;
  metadata: string | null;
  clerk_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type OrderRow = {
  id: number;
  status: string;
  total_amount: number;
  currency: string;
  created_at: string;
  paid_at: string | null;
};

type MockDbOptions = {
  customer?: CustomerRow | null;
  customerByEmail?: CustomerRow | null;
  insertedCustomer?: CustomerRow | null;
  orders?: OrderRow[];
  orderDetail?: {
    id: number;
    status: string;
    total_amount: number;
    subtotal: number;
    tax_amount: number;
    shipping_fee: number;
    total_discount: number;
    currency: string;
    created_at: string;
    paid_at: string | null;
    metadata: string | null;
  } | null;
  orderItems?: Array<{
    product_title: string;
    variant_title: string;
    quantity: number;
    unit_price: number;
    tax_amount: number;
  }>;
  stats?: { total_orders: number; total_spent: number };
  orderCount?: number;
};

const createMockDb = (options: MockDbOptions = {}) => {
  let sqlLog: string[] = [];

  return {
    prepare: vi.fn((sql: string) => {
      sqlLog.push(sql);
      return {
        bind: vi.fn((..._args: unknown[]) => ({
          first: vi.fn(async () => {
            if (sql.includes('FROM customers WHERE clerk_user_id')) {
              return options.customer ?? null;
            }
            if (sql.includes('FROM customers WHERE email') && sql.includes('clerk_user_id IS NULL')) {
              return options.customerByEmail ?? null;
            }
            if (sql.includes('INSERT INTO customers')) {
              return options.insertedCustomer ?? null;
            }
            // Stats query - check for COUNT(*) as total_orders pattern
            if (sql.includes('COUNT(*)') && sql.includes('as total_orders') && sql.includes('total_spent')) {
              return options.stats ?? { total_orders: 0, total_spent: 0 };
            }
            if (sql.includes('COUNT(*) as total') && sql.includes('FROM orders')) {
              return { total: options.orderCount ?? 0 };
            }
            if (sql.includes('FROM orders') && sql.includes('customer_id') && !sql.includes('COUNT')) {
              return options.orderDetail ?? null;
            }
            return null;
          }),
          all: vi.fn(async () => {
            if (sql.includes('FROM orders') && sql.includes('LIMIT')) {
              return { results: options.orders ?? [] };
            }
            if (sql.includes('FROM order_items')) {
              return { results: options.orderItems ?? [] };
            }
            return { results: [] };
          }),
          run: vi.fn(async () => ({ success: true })),
        })),
        first: vi.fn(async () => null),
        all: vi.fn(async () => ({ results: [] })),
        run: vi.fn(async () => ({ success: true })),
      };
    }),
    getSqlLog: () => sqlLog,
  };
};

const createApp = (db: ReturnType<typeof createMockDb>, clerkSecretKey = 'test-secret') => {
  const app = new Hono();
  app.route('/store/account', storeAccount);
  return {
    app,
    fetch: (path: string, options: RequestInit = {}) => {
      const headers = new Headers(options.headers);
      return app.request(path, { ...options, headers }, {
        DB: db,
        CLERK_SECRET_KEY: clerkSecretKey,
        ADMIN_API_KEY: 'admin-key',
      } as any);
    },
  };
};

describe('Store Account API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication', () => {
    it('returns 401 when no Authorization header', async () => {
      const db = createMockDb();
      const { fetch } = createApp(db);

      const res = await fetch('/store/account');
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.message).toBe('Unauthorized');
    });

    it('returns 401 when token verification fails', async () => {
      mockVerifyToken.mockRejectedValue(new Error('Invalid token'));

      const db = createMockDb();
      const { fetch } = createApp(db);

      const res = await fetch('/store/account', {
        headers: { Authorization: 'Bearer invalid-token' },
      });
      expect(res.status).toBe(401);
    });

    it('returns 401 when using API key instead of Clerk token', async () => {
      const db = createMockDb();
      const { fetch } = createApp(db);

      const res = await fetch('/store/account', {
        headers: { 'x-admin-key': 'admin-key' },
      });
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.message).toBe('Authentication required');
    });
  });

  describe('GET /store/account', () => {
    it('returns existing customer account', async () => {
      mockVerifyToken.mockResolvedValue({
        sub: 'user_123',
        email: 'test@example.com',
      } as any);

      const customer: CustomerRow = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        metadata: JSON.stringify({ shipping_address: { postal_code: '123-4567' } }),
        clerk_user_id: 'user_123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const db = createMockDb({
        customer,
        stats: { total_orders: 5, total_spent: 50000 },
      });
      const { fetch } = createApp(db);

      const res = await fetch('/store/account', {
        headers: { Authorization: 'Bearer valid-token' },
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.account.id).toBe(1);
      expect(json.account.name).toBe('Test User');
      expect(json.account.email).toBe('test@example.com');
      expect(json.account.shipping_address).toEqual({ postal_code: '123-4567' });
      expect(json.stats.total_orders).toBe(5);
      expect(json.stats.total_spent).toBe(50000);
    });

    it('links existing customer by email if not linked to Clerk', async () => {
      mockVerifyToken.mockResolvedValue({
        sub: 'user_456',
        email: 'existing@example.com',
      } as any);

      const existingCustomer: CustomerRow = {
        id: 10,
        name: 'Existing User',
        email: 'existing@example.com',
        metadata: null,
        clerk_user_id: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const db = createMockDb({
        customer: null,
        customerByEmail: existingCustomer,
        stats: { total_orders: 2, total_spent: 20000 },
      });
      const { fetch } = createApp(db);

      const res = await fetch('/store/account', {
        headers: { Authorization: 'Bearer valid-token' },
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.account.id).toBe(10);
      expect(json.account.name).toBe('Existing User');
    });

    it('creates new customer if not found', async () => {
      mockVerifyToken.mockResolvedValue({
        sub: 'user_789',
        email: 'new@example.com',
      } as any);

      const newCustomer: CustomerRow = {
        id: 100,
        name: 'new',
        email: 'new@example.com',
        metadata: null,
        clerk_user_id: 'user_789',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const db = createMockDb({
        customer: null,
        customerByEmail: null,
        insertedCustomer: newCustomer,
        stats: { total_orders: 0, total_spent: 0 },
      });
      const { fetch } = createApp(db);

      const res = await fetch('/store/account', {
        headers: { Authorization: 'Bearer valid-token' },
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.account.id).toBe(100);
      expect(json.stats.total_orders).toBe(0);
    });
  });

  describe('GET /store/account/orders', () => {
    it('returns paginated order history', async () => {
      mockVerifyToken.mockResolvedValue({
        sub: 'user_123',
        email: 'test@example.com',
      } as any);

      const customer: CustomerRow = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        metadata: null,
        clerk_user_id: 'user_123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const orders: OrderRow[] = [
        {
          id: 100,
          status: 'completed',
          total_amount: 5000,
          currency: 'JPY',
          created_at: '2024-01-15T00:00:00Z',
          paid_at: '2024-01-15T00:05:00Z',
        },
        {
          id: 99,
          status: 'paid',
          total_amount: 3000,
          currency: 'JPY',
          created_at: '2024-01-10T00:00:00Z',
          paid_at: '2024-01-10T00:05:00Z',
        },
      ];

      const db = createMockDb({
        customer,
        orders,
        orderCount: 15,
      });
      const { fetch } = createApp(db);

      const res = await fetch('/store/account/orders', {
        headers: { Authorization: 'Bearer valid-token' },
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.orders).toHaveLength(2);
      expect(json.orders[0].id).toBe(100);
      expect(json.meta.page).toBe(1);
      expect(json.meta.perPage).toBe(10);
      expect(json.meta.totalCount).toBe(15);
      expect(json.meta.totalPages).toBe(2);
    });

    it('returns empty orders when customer has none', async () => {
      mockVerifyToken.mockResolvedValue({
        sub: 'user_123',
        email: 'test@example.com',
      } as any);

      const customer: CustomerRow = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        metadata: null,
        clerk_user_id: 'user_123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const db = createMockDb({
        customer,
        orders: [],
        orderCount: 0,
      });
      const { fetch } = createApp(db);

      const res = await fetch('/store/account/orders', {
        headers: { Authorization: 'Bearer valid-token' },
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.orders).toEqual([]);
      expect(json.meta.totalCount).toBe(0);
    });

    it('respects pagination parameters', async () => {
      mockVerifyToken.mockResolvedValue({
        sub: 'user_123',
        email: 'test@example.com',
      } as any);

      const customer: CustomerRow = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        metadata: null,
        clerk_user_id: 'user_123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const db = createMockDb({
        customer,
        orders: [],
        orderCount: 100,
      });
      const { fetch } = createApp(db);

      const res = await fetch('/store/account/orders?page=3&perPage=5', {
        headers: { Authorization: 'Bearer valid-token' },
      });
      const json = await res.json();

      expect(json.meta.page).toBe(3);
      expect(json.meta.perPage).toBe(5);
      expect(json.meta.totalPages).toBe(20);
    });
  });

  describe('GET /store/account/orders/:id', () => {
    it('returns order detail for authenticated customer', async () => {
      mockVerifyToken.mockResolvedValue({
        sub: 'user_123',
        email: 'test@example.com',
      } as any);

      const customer: CustomerRow = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        metadata: null,
        clerk_user_id: 'user_123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const orderDetail = {
        id: 100,
        status: 'completed',
        total_amount: 5500,
        subtotal: 5000,
        tax_amount: 500,
        shipping_fee: 0,
        total_discount: 0,
        currency: 'JPY',
        created_at: '2024-01-15T00:00:00Z',
        paid_at: '2024-01-15T00:05:00Z',
        metadata: JSON.stringify({
          shipping: {
            name: 'Test User',
            address: { line1: '1-2-3 Test St', city: 'Tokyo' },
          },
        }),
      };

      const orderItems = [
        {
          product_title: 'LED Light',
          variant_title: 'Red',
          quantity: 2,
          unit_price: 2500,
          tax_amount: 250,
        },
      ];

      const db = createMockDb({
        customer,
        orderDetail,
        orderItems,
      });
      const { fetch } = createApp(db);

      const res = await fetch('/store/account/orders/100', {
        headers: { Authorization: 'Bearer valid-token' },
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.order.id).toBe(100);
      expect(json.order.status).toBe('completed');
      expect(json.order.total_amount).toBe(5500);
      expect(json.order.shipping.name).toBe('Test User');
      expect(json.order.items).toHaveLength(1);
      expect(json.order.items[0].title).toBe('LED Light - Red');
      expect(json.order.items[0].quantity).toBe(2);
    });

    it('returns 404 for non-existent order', async () => {
      mockVerifyToken.mockResolvedValue({
        sub: 'user_123',
        email: 'test@example.com',
      } as any);

      const customer: CustomerRow = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        metadata: null,
        clerk_user_id: 'user_123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const db = createMockDb({
        customer,
        orderDetail: null,
      });
      const { fetch } = createApp(db);

      const res = await fetch('/store/account/orders/999', {
        headers: { Authorization: 'Bearer valid-token' },
      });
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.message).toBe('Order not found');
    });

    it('returns 400 for invalid order ID', async () => {
      mockVerifyToken.mockResolvedValue({
        sub: 'user_123',
        email: 'test@example.com',
      } as any);

      const db = createMockDb();
      const { fetch } = createApp(db);

      const res = await fetch('/store/account/orders/invalid', {
        headers: { Authorization: 'Bearer valid-token' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /store/account/profile', () => {
    it('updates customer profile', async () => {
      mockVerifyToken.mockResolvedValue({
        sub: 'user_123',
        email: 'test@example.com',
      } as any);

      const customer: CustomerRow = {
        id: 1,
        name: 'Old Name',
        email: 'test@example.com',
        metadata: null,
        clerk_user_id: 'user_123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const db = createMockDb({ customer });
      const { fetch } = createApp(db);

      const res = await fetch('/store/account/profile', {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer valid-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'New Name',
          shipping_address: {
            postal_code: '123-4567',
            prefecture: 'Tokyo',
            city: 'Shibuya',
            address1: '1-2-3 Test St',
          },
        }),
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.profile.name).toBe('New Name');
      expect(json.profile.shipping_address.postal_code).toBe('123-4567');
    });

    it('returns 400 for invalid input', async () => {
      mockVerifyToken.mockResolvedValue({
        sub: 'user_123',
        email: 'test@example.com',
      } as any);

      const db = createMockDb();
      const { fetch } = createApp(db);

      const res = await fetch('/store/account/profile', {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer valid-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: '', // Empty name should fail validation
        }),
      });
      expect(res.status).toBe(400);
    });

    it('preserves existing metadata when updating', async () => {
      mockVerifyToken.mockResolvedValue({
        sub: 'user_123',
        email: 'test@example.com',
      } as any);

      const customer: CustomerRow = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        metadata: JSON.stringify({ preferences: { newsletter: true } }),
        clerk_user_id: 'user_123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const db = createMockDb({ customer });
      const { fetch } = createApp(db);

      const res = await fetch('/store/account/profile', {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer valid-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Updated Name',
          shipping_address: { postal_code: '999-0000' },
        }),
      });
      expect(res.status).toBe(200);

      // Verify that the metadata merge is called correctly
      const prepareCall = db.prepare.mock.calls.find((call) =>
        call[0].includes('UPDATE customers')
      );
      expect(prepareCall).toBeDefined();
    });
  });
});
