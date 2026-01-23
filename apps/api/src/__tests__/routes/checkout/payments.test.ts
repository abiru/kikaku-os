import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import payments from '../../../routes/checkout/payments';

type MockDbResult = {
  results?: any[];
  success: boolean;
  meta: { last_row_id?: number };
};

type MockDbStatement = {
  bind: (...args: any[]) => MockDbStatement;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<MockDbResult>;
  run: () => Promise<MockDbResult>;
};

const createMockDb = (overrides: {
  quoteRow?: any;
  customerRow?: any;
  orderInsertId?: number;
  customers?: Map<number, any>;
} = {}) => {
  const customers = overrides.customers || new Map();

  // If customerRow is provided, add it to customers map
  if (overrides.customerRow) {
    customers.set(overrides.customerRow.id, overrides.customerRow);
  }

  return {
    prepare: (sql: string) => {
      let boundArgs: any[] = [];

      const statement: MockDbStatement = {
        bind: (...args: any[]) => {
          boundArgs = args;
          return statement;
        },
        first: async <T>() => {
          // Quote lookup
          if (sql.includes('FROM checkout_quotes')) {
            return (overrides.quoteRow || null) as T;
          }
          // Customer lookup by email
          if (sql.includes('FROM customers WHERE email=?')) {
            return (overrides.customerRow || null) as T;
          }
          // Customer lookup by ID (for ensureStripeCustomer)
          if (sql.includes('FROM customers WHERE id = ?')) {
            const customerId = boundArgs[0];
            return (customers.get(customerId) || null) as T;
          }
          return null;
        },
        all: async <T>() => {
          return { results: [], success: true, meta: {} } as MockDbResult;
        },
        run: async () => {
          // Order insert
          if (sql.includes('INSERT INTO orders')) {
            return {
              success: true,
              meta: { last_row_id: overrides.orderInsertId || 123 }
            };
          }
          // Customer insert
          if (sql.includes('INSERT INTO customers')) {
            const customerId = 456;
            customers.set(customerId, {
              id: customerId,
              email: boundArgs[1],
              stripe_customer_id: null
            });
            return {
              success: true,
              meta: { last_row_id: customerId }
            };
          }
          // Customer update (stripe_customer_id)
          if (sql.includes('UPDATE customers SET stripe_customer_id')) {
            const [stripeCustomerId, customerId] = boundArgs;
            const customer = customers.get(customerId);
            if (customer) {
              customer.stripe_customer_id = stripeCustomerId;
            }
            return { success: true, meta: {} };
          }
          // Other update operations
          if (sql.includes('UPDATE')) {
            return { success: true, meta: {} };
          }
          // Delete operations
          if (sql.includes('DELETE')) {
            return { success: true, meta: {} };
          }
          return { success: true, meta: {} };
        }
      };

      return statement;
    }
  };
};

describe('POST /payments/intent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates payment intent with valid quote and email', async () => {
    const app = new Hono();
    app.route('/', payments);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        // ensureStripeCustomer verification call
        ok: true,
        json: async () => ({ id: 'cus_existing' })
      })
      .mockResolvedValueOnce({
        // PaymentIntent creation
        ok: true,
        json: async () => ({
          id: 'pi_test_123',
          client_secret: 'pi_test_123_secret_abc',
          amount: 6000,
          currency: 'jpy',
          customer: 'cus_test_123',
          payment_method_types: ['card', 'customer_balance']
        })
      });

    globalThis.fetch = fetchMock as any;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

    const env = {
      DB: createMockDb({
        quoteRow: {
          id: 'quote_123',
          items_json: JSON.stringify([{ variantId: 10, quantity: 2 }]),
          coupon_code: null,
          coupon_id: null,
          subtotal: 5000,
          tax_amount: 500,
          cart_total: 5500,
          discount: 0,
          shipping_fee: 500,
          grand_total: 6000,
          currency: 'JPY',
          expires_at: expiresAt
        },
        customerRow: {
          id: 789,
          email: 'test@example.com',
          stripe_customer_id: 'cus_existing'
        }
      }),
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_PUBLISHABLE_KEY: 'pk_test_123'
    } as any;

    const res = await app.request(
      'http://localhost/payments/intent',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          quoteId: 'quote_123',
          email: 'test@example.com'
        })
      },
      env
    );

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.clientSecret).toBe('pi_test_123_secret_abc');
    expect(json.orderId).toBe(123);
    expect(json.publishableKey).toBe('pk_test_123');

    // Verify PaymentIntent creation call
    const paymentIntentCall = fetchMock.mock.calls[1];
    expect(paymentIntentCall[0]).toBe('https://api.stripe.com/v1/payment_intents');
    const body = String(paymentIntentCall[1]?.body || '');
    const params = new URLSearchParams(body);
    expect(params.get('amount')).toBe('6000');
    expect(params.get('currency')).toBe('jpy');
    expect(params.get('customer')).toBe('cus_existing');
    expect(params.get('automatic_payment_methods[enabled]')).toBe('true');
    expect(params.get('payment_method_options[customer_balance][funding_type]')).toBe('bank_transfer');
  });

  it('returns 400 for missing quoteId', async () => {
    const app = new Hono();
    app.route('/', payments);

    const env = {
      DB: createMockDb(),
      STRIPE_SECRET_KEY: 'sk_test_123'
    } as any;

    const res = await app.request(
      'http://localhost/payments/intent',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' })
      },
      env
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.message).toContain('quoteId');
  });

  it('returns 400 for invalid email', async () => {
    const app = new Hono();
    app.route('/', payments);

    const env = {
      DB: createMockDb(),
      STRIPE_SECRET_KEY: 'sk_test_123'
    } as any;

    const res = await app.request(
      'http://localhost/payments/intent',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          quoteId: 'quote_123',
          email: 'invalid-email'
        })
      },
      env
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.message).toContain('email');
  });

  it('returns 400 for expired quote', async () => {
    const app = new Hono();
    app.route('/', payments);

    const pastDate = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago

    const env = {
      DB: createMockDb({
        quoteRow: {
          id: 'quote_123',
          items_json: '[]',
          grand_total: 1000,
          currency: 'JPY',
          expires_at: pastDate
        }
      }),
      STRIPE_SECRET_KEY: 'sk_test_123'
    } as any;

    const res = await app.request(
      'http://localhost/payments/intent',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          quoteId: 'quote_123',
          email: 'test@example.com'
        })
      },
      env
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.message).toContain('expired');
  });

  it('returns 400 for quote not found', async () => {
    const app = new Hono();
    app.route('/', payments);

    const env = {
      DB: createMockDb({
        quoteRow: null
      }),
      STRIPE_SECRET_KEY: 'sk_test_123'
    } as any;

    const res = await app.request(
      'http://localhost/payments/intent',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          quoteId: 'nonexistent',
          email: 'test@example.com'
        })
      },
      env
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.message).toContain('not found');
  });

  it('creates new customer when email not found', async () => {
    const app = new Hono();
    app.route('/', payments);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        // Stripe customer creation
        ok: true,
        json: async () => ({ id: 'cus_new_123' })
      })
      .mockResolvedValueOnce({
        // PaymentIntent creation
        ok: true,
        json: async () => ({
          id: 'pi_test_456',
          client_secret: 'pi_test_456_secret_xyz'
        })
      });

    globalThis.fetch = fetchMock as any;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

    const env = {
      DB: createMockDb({
        quoteRow: {
          id: 'quote_456',
          items_json: '[]',
          grand_total: 3000,
          currency: 'JPY',
          expires_at: expiresAt
        },
        customerRow: null // No existing customer
      }),
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_PUBLISHABLE_KEY: 'pk_test_123'
    } as any;

    const res = await app.request(
      'http://localhost/payments/intent',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          quoteId: 'quote_456',
          email: 'newuser@example.com'
        })
      },
      env
    );

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.clientSecret).toBe('pi_test_456_secret_xyz');

    // Verify Stripe customer was created
    const customerCall = fetchMock.mock.calls[0];
    expect(customerCall[0]).toBe('https://api.stripe.com/v1/customers');
  });

  it('includes coupon metadata when quote has coupon', async () => {
    const app = new Hono();
    app.route('/', payments);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'cus_test' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'pi_test_789',
          client_secret: 'pi_test_789_secret'
        })
      });

    globalThis.fetch = fetchMock as any;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

    const env = {
      DB: createMockDb({
        quoteRow: {
          id: 'quote_789',
          items_json: '[]',
          coupon_code: 'SUMMER20',
          coupon_id: 42,
          grand_total: 4000,
          discount: 1000,
          currency: 'JPY',
          expires_at: expiresAt
        },
        customerRow: {
          id: 999,
          stripe_customer_id: 'cus_test'
        }
      }),
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_PUBLISHABLE_KEY: 'pk_test_123'
    } as any;

    const res = await app.request(
      'http://localhost/payments/intent',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          quoteId: 'quote_789',
          email: 'test@example.com'
        })
      },
      env
    );

    expect(res.status).toBe(200);

    // Verify coupon metadata in PaymentIntent
    const paymentIntentCall = fetchMock.mock.calls[1];
    const body = String(paymentIntentCall[1]?.body || '');
    const params = new URLSearchParams(body);
    expect(params.get('metadata[couponId]')).toBe('42');
    expect(params.get('metadata[discountAmount]')).toBe('1000');
  });
});
