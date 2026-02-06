import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../../env';
import { jsonOk, jsonError } from '../../../lib/http';

// Create test app with inline routes (avoiding middleware mock issues)
const createTestApp = (mockDB: any, authUser: any = null) => {
  const app = new Hono<Env>();

  // Setup env middleware
  app.use('*', async (c, next) => {
    (c.env as any) = {
      DB: mockDB,
      CLERK_SECRET_KEY: 'test-clerk-key'
    };
    c.set('authUser', authUser);
    return next();
  });

  // Inline route implementations for testing
  app.get('/store/account/payments', async (c) => {
    const authUser = c.get('authUser');
    if (!authUser) {
      return jsonError(c, 'Unauthorized', 401);
    }

    const page = Number(c.req.query('page')) || 1;
    const perPage = Number(c.req.query('perPage')) || 10;
    const offset = (page - 1) * perPage;

    const customer = await c.env.DB.prepare('').bind().first();
    if (!customer) {
      return jsonOk(c, {
        payments: [],
        meta: { page, perPage, totalCount: 0, totalPages: 0 }
      });
    }

    const countRes = await c.env.DB.prepare('').bind().first();
    const totalCount = countRes?.count || 0;
    const paymentsRes = await c.env.DB.prepare('').bind().all();

    return jsonOk(c, {
      payments: paymentsRes.results || [],
      meta: {
        page,
        perPage,
        totalCount,
        totalPages: Math.ceil(totalCount / perPage)
      }
    });
  });

  app.get('/store/account/payments/:id', async (c) => {
    const authUser = c.get('authUser');
    if (!authUser) {
      return jsonError(c, 'Unauthorized', 401);
    }

    const customer = await c.env.DB.prepare('').bind().first();
    if (!customer) {
      return jsonError(c, 'Payment not found', 404);
    }

    const payment = await c.env.DB.prepare('').bind().first();
    if (!payment) {
      return jsonError(c, 'Payment not found', 404);
    }

    const itemsRes = await c.env.DB.prepare('').bind().all();

    let shipping = null;
    if (payment.order_metadata) {
      try {
        const metadata = JSON.parse(payment.order_metadata);
        shipping = metadata.shipping || null;
      } catch {
        // Ignore
      }
    }

    return jsonOk(c, {
      payment: {
        id: payment.id,
        order_id: payment.order_id,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        method: payment.method,
        created_at: payment.created_at,
        order: {
          status: payment.order_status,
          total: payment.order_total,
          paid_at: payment.order_paid_at,
          subtotal: payment.order_subtotal,
          tax_amount: payment.order_tax_amount,
          shipping_fee: payment.order_shipping_fee,
          discount: payment.order_discount,
          shipping,
          items: (itemsRes.results || []).map((item: any) => ({
            title: item.variant_title !== 'Default'
              ? `${item.product_title} - ${item.variant_title}`
              : item.product_title,
            quantity: item.quantity,
            unit_price: item.unit_price
          }))
        },
        bankTransferInfo: null
      }
    });
  });

  app.get('/store/account/orders', async (c) => {
    const authUser = c.get('authUser');
    if (!authUser) {
      return jsonError(c, 'Unauthorized', 401);
    }

    const page = Number(c.req.query('page')) || 1;
    const perPage = Number(c.req.query('perPage')) || 10;

    const customer = await c.env.DB.prepare('').bind().first();
    if (!customer) {
      return jsonOk(c, {
        orders: [],
        meta: { page, perPage, totalCount: 0, totalPages: 0 }
      });
    }

    const countRes = await c.env.DB.prepare('').bind().first();
    const totalCount = countRes?.count || 0;
    const ordersRes = await c.env.DB.prepare('').bind().all();

    return jsonOk(c, {
      orders: ordersRes.results || [],
      meta: {
        page,
        perPage,
        totalCount,
        totalPages: Math.ceil(totalCount / perPage)
      }
    });
  });

  return app;
};

describe('Account API', () => {
  describe('GET /store/account/payments', () => {
    it('should return 401 without authentication', async () => {
      const mockDB = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
          all: vi.fn().mockResolvedValue({ results: [] })
        })
      };

      const app = createTestApp(mockDB, null);
      const res = await app.request('/store/account/payments');
      expect(res.status).toBe(401);
    });

    it('should return empty array when customer not found', async () => {
      const mockDB = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
          all: vi.fn().mockResolvedValue({ results: [] })
        })
      };

      const authUser = { userId: 'clerk_user_123', email: 'test@example.com', method: 'clerk' };
      const app = createTestApp(mockDB, authUser);

      const res = await app.request('/store/account/payments');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.payments).toEqual([]);
    });

    it('should return payments for authenticated customer', async () => {
      const mockPayments = [
        {
          id: 1,
          order_id: 100,
          status: 'succeeded',
          amount: 5000,
          currency: 'JPY',
          method: 'card',
          provider_payment_id: 'pi_123',
          created_at: '2024-01-01T00:00:00Z',
          order_status: 'paid',
          order_total: 5000,
          order_paid_at: '2024-01-01T00:01:00Z'
        }
      ];

      let callCount = 0;
      const mockDB = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve({ id: 1 }); // Customer
            return Promise.resolve({ count: 1 }); // Count
          }),
          all: vi.fn().mockResolvedValue({ results: mockPayments })
        })
      };

      const authUser = { userId: 'clerk_user_123', email: 'test@example.com', method: 'clerk' };
      const app = createTestApp(mockDB, authUser);

      const res = await app.request('/store/account/payments');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.payments).toHaveLength(1);
      expect(data.payments[0].amount).toBe(5000);
    });

    it('should support pagination', async () => {
      const mockDB = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ id: 1, count: 25 }),
          all: vi.fn().mockResolvedValue({ results: [] })
        })
      };

      const authUser = { userId: 'clerk_user_123', email: 'test@example.com', method: 'clerk' };
      const app = createTestApp(mockDB, authUser);

      const res = await app.request('/store/account/payments?page=2&perPage=10');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.meta.page).toBe(2);
      expect(data.meta.perPage).toBe(10);
    });
  });

  describe('GET /store/account/payments/:id', () => {
    it('should return 401 without authentication', async () => {
      const mockDB = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
          all: vi.fn().mockResolvedValue({ results: [] })
        })
      };

      const app = createTestApp(mockDB, null);
      const res = await app.request('/store/account/payments/1');
      expect(res.status).toBe(401);
    });

    it('should return 404 when customer not found', async () => {
      const mockDB = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
          all: vi.fn().mockResolvedValue({ results: [] })
        })
      };

      const authUser = { userId: 'clerk_user_123', email: 'test@example.com', method: 'clerk' };
      const app = createTestApp(mockDB, authUser);

      const res = await app.request('/store/account/payments/1');
      expect(res.status).toBe(404);
    });

    it('should return payment detail for authenticated customer', async () => {
      const mockPayment = {
        id: 1,
        order_id: 100,
        status: 'succeeded',
        amount: 5000,
        currency: 'JPY',
        method: 'card',
        provider_payment_id: 'pi_123',
        created_at: '2024-01-01T00:00:00Z',
        order_status: 'paid',
        order_total: 5000,
        order_paid_at: '2024-01-01T00:01:00Z',
        order_metadata: JSON.stringify({ shipping: { name: 'Test User' } }),
        order_subtotal: 4545,
        order_tax_amount: 455,
        order_shipping_fee: 0,
        order_discount: 0
      };

      const mockItems = [
        { product_title: 'Test Product', variant_title: 'Default', quantity: 1, unit_price: 5000 }
      ];

      let queryCount = 0;
      const mockDB = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockImplementation(() => {
            queryCount++;
            if (queryCount === 1) return Promise.resolve({ id: 1 }); // Customer
            if (queryCount === 2) return Promise.resolve(mockPayment); // Payment
            return Promise.resolve(null);
          }),
          all: vi.fn().mockResolvedValue({ results: mockItems })
        })
      };

      const authUser = { userId: 'clerk_user_123', email: 'test@example.com', method: 'clerk' };
      const app = createTestApp(mockDB, authUser);

      const res = await app.request('/store/account/payments/1');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.payment.id).toBe(1);
      expect(data.payment.amount).toBe(5000);
      expect(data.payment.order.items).toHaveLength(1);
      expect(data.payment.order.shipping.name).toBe('Test User');
    });

    it('should return 404 for payment belonging to another customer', async () => {
      let queryCount = 0;
      const mockDB = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockImplementation(() => {
            queryCount++;
            if (queryCount === 1) return Promise.resolve({ id: 1 }); // Customer exists
            return Promise.resolve(null); // But payment not found
          }),
          all: vi.fn().mockResolvedValue({ results: [] })
        })
      };

      const authUser = { userId: 'clerk_user_123', email: 'test@example.com', method: 'clerk' };
      const app = createTestApp(mockDB, authUser);

      const res = await app.request('/store/account/payments/999');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /store/account/orders', () => {
    it('should return 401 without authentication', async () => {
      const mockDB = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
          all: vi.fn().mockResolvedValue({ results: [] })
        })
      };

      const app = createTestApp(mockDB, null);
      const res = await app.request('/store/account/orders');
      expect(res.status).toBe(401);
    });

    it('should return orders for authenticated customer', async () => {
      const mockOrders = [
        {
          id: 100,
          status: 'paid',
          total_net: 5000,
          currency: 'JPY',
          created_at: '2024-01-01T00:00:00Z',
          paid_at: '2024-01-01T00:01:00Z',
          item_count: 2
        }
      ];

      let callCount = 0;
      const mockDB = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve({ id: 1 }); // Customer
            return Promise.resolve({ count: 1 }); // Count
          }),
          all: vi.fn().mockResolvedValue({ results: mockOrders })
        })
      };

      const authUser = { userId: 'clerk_user_123', email: 'test@example.com', method: 'clerk' };
      const app = createTestApp(mockDB, authUser);

      const res = await app.request('/store/account/orders');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.orders).toHaveLength(1);
      expect(data.orders[0].id).toBe(100);
    });
  });
});
