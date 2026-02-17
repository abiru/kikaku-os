import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import payments from '../../../routes/checkout/payments';

type MockDbResult = {
  results?: any[];
  success: boolean;
  meta: { last_row_id?: number; changes?: number };
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
  stockByVariant?: Record<number, number>;
  variantPrices?: Record<number, { unitPrice: number; taxRate?: number }>;
  idempotencyCache?: Map<string, { status_code: number; response_body: string }>;
} = {}) => {
  const customers = overrides.customers || new Map();
  const stockByVariant = overrides.stockByVariant || {};
  const variantPrices = overrides.variantPrices || {};
  const idempotencyCache = overrides.idempotencyCache || new Map<string, { status_code: number; response_body: string }>();
  const stock = new Map<number, number>(
    Object.entries(stockByVariant).map(([id, qty]) => [Number(id), qty])
  );
  const reservations: Array<{ orderId: number; reservationId: string; variantId: number; quantity: number; state: 'reservation' | 'sale' | 'released' }> = [];

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
          // Idempotency cache lookup
          if (sql.includes('FROM idempotency_keys')) {
            const key = String(boundArgs[0]);
            const cached = idempotencyCache.get(key);
            return (cached || null) as T;
          }
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
          if (sql.includes('FROM inventory_movements')) {
            const variantIds = boundArgs.map((id) => Number(id));
            const results = variantIds.map((variantId) => ({
              variantId,
              onHand: stock.get(variantId) ?? 0
            }));
            return { results, success: true, meta: {} } as MockDbResult;
          }
          if (sql.includes('FROM variants v') && sql.includes('unitPrice')) {
            const variantIds = boundArgs.map((id) => Number(id));
            const results = variantIds.map((variantId) => ({
              variantId,
              unitPrice: variantPrices[variantId]?.unitPrice ?? 3000,
              taxRate: variantPrices[variantId]?.taxRate ?? 0.10
            }));
            return { results, success: true, meta: {} } as MockDbResult;
          }
          return { results: [], success: true, meta: {} } as MockDbResult;
        },
        run: async () => {
          // Idempotency cache insert
          if (sql.includes('INSERT') && sql.includes('idempotency_keys')) {
            const key = String(boundArgs[0]);
            const statusCode = Number(boundArgs[2]);
            const responseBody = String(boundArgs[3]);
            idempotencyCache.set(key, { status_code: statusCode, response_body: responseBody });
            return { success: true, meta: { changes: 1 } };
          }
          // Order insert
          if (sql.includes('INSERT INTO orders')) {
            return {
              success: true,
              meta: { last_row_id: overrides.orderInsertId || 123, changes: 1 }
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
              meta: { last_row_id: customerId, changes: 1 }
            };
          }
          // Reservation insert (conditional)
          if (
            sql.includes('INSERT INTO inventory_movements') &&
            sql.includes("SELECT ?, ?, 'reservation'")
          ) {
            const variantId = Number(boundArgs[0]);
            const requested = Math.abs(Number(boundArgs[1]));
            const metadata = JSON.parse(String(boundArgs[2])) as {
              order_id: number;
              reservation_id: string;
            };
            const onHand = stock.get(variantId) ?? 0;

            if (onHand < requested) {
              return { success: true, meta: { changes: 0 } };
            }

            stock.set(variantId, onHand - requested);
            reservations.push({
              orderId: metadata.order_id,
              reservationId: metadata.reservation_id,
              variantId,
              quantity: requested,
              state: 'reservation'
            });
            return { success: true, meta: { changes: 1 } };
          }
          // Reservation rollback by reservation_id
          if (
            sql.includes("SET delta = 0") &&
            sql.includes("json_extract(metadata, '$.reservation_id')")
          ) {
            const reservationId = String(boundArgs[0]);
            let changes = 0;
            for (const reservation of reservations) {
              if (reservation.reservationId === reservationId && reservation.state === 'reservation') {
                stock.set(
                  reservation.variantId,
                  (stock.get(reservation.variantId) ?? 0) + reservation.quantity
                );
                reservation.state = 'released';
                changes += 1;
              }
            }
            return { success: true, meta: { changes } };
          }
          // Consume reservation on payment success
          if (
            sql.includes("SET reason = 'sale'") &&
            sql.includes("json_extract(metadata, '$.order_id')")
          ) {
            const orderId = Number(boundArgs[0]);
            let changes = 0;
            for (const reservation of reservations) {
              if (reservation.orderId === orderId && reservation.state === 'reservation') {
                reservation.state = 'sale';
                changes += 1;
              }
            }
            return { success: true, meta: { changes } };
          }
          // Release reservation by order_id
          if (
            sql.includes("SET delta = 0") &&
            sql.includes("json_extract(metadata, '$.order_id')")
          ) {
            const orderId = Number(boundArgs[0]);
            let changes = 0;
            for (const reservation of reservations) {
              if (reservation.orderId === orderId && reservation.state === 'reservation') {
                stock.set(
                  reservation.variantId,
                  (stock.get(reservation.variantId) ?? 0) + reservation.quantity
                );
                reservation.state = 'released';
                changes += 1;
              }
            }
            return { success: true, meta: { changes } };
          }
          // Customer update (stripe_customer_id)
          if (sql.includes('UPDATE customers SET stripe_customer_id')) {
            const [stripeCustomerId, customerId] = boundArgs;
            const customer = customers.get(customerId);
            if (customer) {
              customer.stripe_customer_id = stripeCustomerId;
            }
            return { success: true, meta: { changes: 1 } };
          }
          // Other update operations
          if (sql.includes('UPDATE')) {
            return { success: true, meta: { changes: 1 } };
          }
          // Delete operations
          if (sql.includes('DELETE')) {
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 1 } };
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
        },
        stockByVariant: { 10: 10 }
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
    expect(params.get('metadata[paymentMethod]')).toBe('auto');
    expect(params.get('automatic_payment_methods[enabled]')).toBeNull();
    expect(params.getAll('payment_method_types[]')).toEqual(['card', 'customer_balance']);
  });

  it('creates bank transfer payment intent when paymentMethod=bank_transfer', async () => {
    const app = new Hono();
    app.route('/', payments);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'cus_existing' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'pi_test_bank_123',
          client_secret: 'pi_test_bank_123_secret_abc',
          amount: 6000,
          currency: 'jpy',
          customer: 'cus_test_123',
          payment_method_types: ['customer_balance']
        })
      });

    globalThis.fetch = fetchMock as any;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

    const env = {
      DB: createMockDb({
        quoteRow: {
          id: 'quote_bank_123',
          items_json: JSON.stringify([{ variantId: 10, quantity: 1 }]),
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
        },
        stockByVariant: { 10: 10 }
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
          quoteId: 'quote_bank_123',
          email: 'test@example.com',
          paymentMethod: 'bank_transfer'
        })
      },
      env
    );

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);

    const paymentIntentCall = fetchMock.mock.calls[1];
    const body = String(paymentIntentCall[1]?.body || '');
    const params = new URLSearchParams(body);
    expect(params.get('payment_method_types[]')).toBe('customer_balance');
    expect(params.get('payment_method_options[customer_balance][funding_type]')).toBe('bank_transfer');
    expect(params.get('payment_method_options[customer_balance][bank_transfer][type]')).toBe('jp_bank_transfer');
    expect(params.get('metadata[paymentMethod]')).toBe('bank_transfer');
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
    expect(json.message).toContain('expected string');
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

  it('forwards Idempotency-Key header to Stripe', async () => {
    const app = new Hono();
    app.route('/', payments);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'cus_existing' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'pi_idem_123',
          client_secret: 'pi_idem_123_secret'
        })
      });

    globalThis.fetch = fetchMock as any;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

    const env = {
      DB: createMockDb({
        quoteRow: {
          id: 'quote_idem',
          items_json: JSON.stringify([{ variantId: 10, quantity: 1 }]),
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
        },
        stockByVariant: { 10: 10 }
      }),
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_PUBLISHABLE_KEY: 'pk_test_123'
    } as any;

    const res = await app.request(
      'http://localhost/payments/intent',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': 'idem-key-abc-123'
        },
        body: JSON.stringify({
          quoteId: 'quote_idem',
          email: 'test@example.com'
        })
      },
      env
    );

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.clientSecret).toBe('pi_idem_123_secret');

    // Verify Idempotency-Key was forwarded to Stripe
    const paymentIntentCall = fetchMock.mock.calls[1];
    const stripeHeaders = paymentIntentCall[1]?.headers as Record<string, string>;
    expect(stripeHeaders['Idempotency-Key']).toBe('idem-key-abc-123');
  });

  it('returns cached response for duplicate idempotency key', async () => {
    const app = new Hono();
    app.route('/', payments);

    const cachedResponse = JSON.stringify({
      ok: true,
      clientSecret: 'pi_cached_secret',
      orderId: 999,
      orderPublicToken: 'cached_token',
      publishableKey: 'pk_test_123'
    });

    const idempotencyCache = new Map<string, { status_code: number; response_body: string }>();
    idempotencyCache.set('idem-duplicate-key', {
      status_code: 200,
      response_body: cachedResponse
    });

    // fetch should NOT be called when returning cached response
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as any;

    const env = {
      DB: createMockDb({
        idempotencyCache
      }),
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_PUBLISHABLE_KEY: 'pk_test_123'
    } as any;

    const res = await app.request(
      'http://localhost/payments/intent',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': 'idem-duplicate-key'
        },
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
    expect(json.clientSecret).toBe('pi_cached_secret');
    expect(json.orderId).toBe(999);

    // Verify Stripe was NOT called (cached response used)
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('processes normally without Idempotency-Key header', async () => {
    const app = new Hono();
    app.route('/', payments);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'cus_existing' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'pi_no_idem',
          client_secret: 'pi_no_idem_secret'
        })
      });

    globalThis.fetch = fetchMock as any;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

    const env = {
      DB: createMockDb({
        quoteRow: {
          id: 'quote_no_idem',
          items_json: JSON.stringify([{ variantId: 10, quantity: 1 }]),
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
        },
        stockByVariant: { 10: 10 }
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
          quoteId: 'quote_no_idem',
          email: 'test@example.com'
        })
      },
      env
    );

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);

    // Verify Stripe was called without Idempotency-Key
    const paymentIntentCall = fetchMock.mock.calls[1];
    const stripeHeaders = paymentIntentCall[1]?.headers as Record<string, string>;
    expect(stripeHeaders['Idempotency-Key']).toBeUndefined();
  });

  it('stores response in idempotency cache after successful creation', async () => {
    const app = new Hono();
    app.route('/', payments);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'cus_existing' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'pi_store_cache',
          client_secret: 'pi_store_cache_secret'
        })
      });

    globalThis.fetch = fetchMock as any;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

    const idempotencyCache = new Map<string, { status_code: number; response_body: string }>();

    const env = {
      DB: createMockDb({
        quoteRow: {
          id: 'quote_store',
          items_json: JSON.stringify([{ variantId: 10, quantity: 1 }]),
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
        },
        stockByVariant: { 10: 10 },
        idempotencyCache
      }),
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_PUBLISHABLE_KEY: 'pk_test_123'
    } as any;

    const res = await app.request(
      'http://localhost/payments/intent',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': 'idem-store-key'
        },
        body: JSON.stringify({
          quoteId: 'quote_store',
          email: 'test@example.com'
        })
      },
      env
    );

    expect(res.status).toBe(200);

    // Verify the response was stored in the idempotency cache
    const cached = idempotencyCache.get('idem-store-key');
    expect(cached).toBeDefined();
    expect(cached!.status_code).toBe(200);
    const cachedBody = JSON.parse(cached!.response_body);
    expect(cachedBody.ok).toBe(true);
    expect(cachedBody.clientSecret).toBe('pi_store_cache_secret');
  });
});
