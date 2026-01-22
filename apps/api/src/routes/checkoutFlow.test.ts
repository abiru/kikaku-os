import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import checkout from './checkout';
import payments from './payments';

/**
 * Integration tests for the checkout flow:
 * 1. Create quote (POST /checkout/quote)
 * 2. Create payment intent (POST /payments/intent)
 * 
 * This tests the full flow without webhook processing (webhook tests are separate)
 */

type MockDbData = {
  quotes: Map<string, any>;
  customers: Map<number, any>;
  orders: Map<number, any>;
  variantRows: Array<any>;
  nextCustomerId: number;
  nextOrderId: number;
};

const createIntegrationMockDb = (variantRows: any[] = []) => {
  const data: MockDbData = {
    quotes: new Map(),
    customers: new Map(),
    orders: new Map(),
    variantRows,
    nextCustomerId: 1,
    nextOrderId: 1
  };

  return {
    prepare: (sql: string) => {
      let boundArgs: any[] = [];

      const statement = {
        bind: (...args: any[]) => {
          boundArgs = args;
          return statement;
        },
        first: async <T>() => {
          // Quote lookup
          if (sql.includes('FROM checkout_quotes')) {
            const quoteId = boundArgs[0];
            const quote = data.quotes.get(quoteId);
            return (quote || null) as T;
          }

          // Customer lookup by email
          if (sql.includes('FROM customers WHERE email=?')) {
            const email = boundArgs[0];
            const customer = Array.from(data.customers.values()).find(c => c.email === email);
            return (customer || null) as T;
          }

          // Customer lookup by ID
          if (sql.includes('FROM customers WHERE id = ?')) {
            const id = boundArgs[0];
            return (data.customers.get(id) || null) as T;
          }

          return null;
        },
        all: async <T>() => {
          // Variant rows for quote/checkout
          if (sql.includes('FROM variants v') && sql.includes('JOIN products p')) {
            return {
              results: data.variantRows,
              success: true,
              meta: {}
            };
          }

          return { results: [], success: true, meta: {} };
        },
        run: async () => {
          // Quote insert
          if (sql.includes('INSERT INTO checkout_quotes')) {
            const [id, items_json, coupon_code, coupon_id, subtotal, tax_amount, cart_total, discount, shipping_fee, grand_total, currency, expires_at] = boundArgs;
            data.quotes.set(id, {
              id,
              items_json,
              coupon_code,
              coupon_id,
              subtotal,
              tax_amount,
              cart_total,
              discount,
              shipping_fee,
              grand_total,
              currency,
              expires_at
            });
            return { success: true, meta: {} };
          }

          // Customer insert
          if (sql.includes('INSERT INTO customers')) {
            const customerId = data.nextCustomerId++;
            const [name, email] = boundArgs;
            data.customers.set(customerId, {
              id: customerId,
              name,
              email,
              stripe_customer_id: null
            });
            return { success: true, meta: { last_row_id: customerId } };
          }

          // Customer update (stripe_customer_id)
          if (sql.includes('UPDATE customers SET stripe_customer_id')) {
            const [stripeCustomerId, customerId] = boundArgs;
            const customer = data.customers.get(customerId);
            if (customer) {
              customer.stripe_customer_id = stripeCustomerId;
            }
            return { success: true, meta: {} };
          }

          // Order insert
          if (sql.includes('INSERT INTO orders')) {
            const orderId = data.nextOrderId++;
            const order = {
              id: orderId,
              customer_id: boundArgs[0],
              status: 'pending',
              quote_id: boundArgs[1],
              subtotal: boundArgs[2],
              tax_amount: boundArgs[3],
              total_net: boundArgs[4],
              total_discount: boundArgs[5],
              shipping_fee: boundArgs[6],
              total_amount: boundArgs[7],
              coupon_code: boundArgs[8],
              currency: boundArgs[9],
              metadata: boundArgs[10],
              provider_payment_intent_id: null,
              paid_at: null
            };
            data.orders.set(orderId, order);
            return { success: true, meta: { last_row_id: orderId } };
          }

          // Order update (provider_payment_intent_id)
          if (sql.includes('UPDATE orders') && sql.includes('provider_payment_intent_id = ?')) {
            const [intentId, orderId] = boundArgs;
            const order = data.orders.get(orderId);
            if (order) {
              order.provider_payment_intent_id = intentId;
            }
            return { success: true, meta: {} };
          }

          // Quote delete
          if (sql.includes('DELETE FROM checkout_quotes')) {
            const quoteId = boundArgs[0];
            data.quotes.delete(quoteId);
            return { success: true, meta: {} };
          }

          return { success: true, meta: {} };
        }
      };

      return statement;
    },
    // Expose internal data for assertions
    _data: data
  };
};

describe('Checkout Integration Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('completes quote → payment intent flow', async () => {
    // Setup apps
    const checkoutApp = new Hono();
    checkoutApp.route('/', checkout);

    const paymentsApp = new Hono();
    paymentsApp.route('/', payments);

    // Mock Stripe API calls
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        // ensureStripeCustomer - create customer
        ok: true,
        json: async () => ({ id: 'cus_integration_test' })
      })
      .mockResolvedValueOnce({
        // PaymentIntent creation
        ok: true,
        json: async () => ({
          id: 'pi_integration_test_123',
          client_secret: 'pi_integration_test_123_secret',
          amount: 6000,
          currency: 'jpy',
          customer: 'cus_integration_test'
        })
      });

    globalThis.fetch = fetchMock as any;

    // Setup mock DB with variant data
    const mockDb = createIntegrationMockDb([
      {
        variant_id: 10,
        variant_title: 'Medium',
        product_id: 5,
        product_title: 'Test Product',
        provider_product_id: 'prod_test',
        price_id: 1,
        amount: 3000,
        currency: 'JPY',
        provider_price_id: 'price_test',
        image_r2_key: null,
        tax_rate: 0.10
      }
    ]);

    const env = {
      DB: mockDb,
      STRIPE_SECRET_KEY: 'sk_test_integration',
      STRIPE_PUBLISHABLE_KEY: 'pk_test_integration',
      ENABLE_BANK_TRANSFER: 'true',
      SHIPPING_FEE_AMOUNT: '500',
      FREE_SHIPPING_THRESHOLD: '5000'
    } as any;

    // Step 1: Create quote
    const quoteRes = await checkoutApp.request(
      'http://localhost/checkout/quote',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: [{ variantId: 10, quantity: 2 }]
        })
      },
      env
    );

    const quoteJson = await quoteRes.json();
    expect(quoteRes.status).toBe(200);
    expect(quoteJson.ok).toBe(true);
    expect(quoteJson.quoteId).toBeDefined();
    expect(quoteJson.breakdown.grandTotal).toBe(6000);

    const quoteId = quoteJson.quoteId;

    // Step 2: Create payment intent
    const intentRes = await paymentsApp.request(
      'http://localhost/payments/intent',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          quoteId,
          email: 'integration@test.com'
        })
      },
      env
    );

    const intentJson = await intentRes.json();
    expect(intentRes.status).toBe(200);
    expect(intentJson.ok).toBe(true);
    expect(intentJson.clientSecret).toBe('pi_integration_test_123_secret');
    expect(intentJson.orderId).toBe(1);

    const orderId = intentJson.orderId;

    // Verify quote was deleted
    expect(mockDb._data.quotes.has(quoteId)).toBe(false);

    // Verify order was created
    const order = mockDb._data.orders.get(orderId);
    expect(order).toBeDefined();
    expect(order?.status).toBe('pending');
    expect(order?.provider_payment_intent_id).toBe('pi_integration_test_123');
    expect(order?.quote_id).toBe(quoteId);
    expect(order?.total_amount).toBe(6000);
    expect(order?.customer_id).toBeDefined();

    // Verify customer was created with Stripe customer ID
    const customer = mockDb._data.customers.get(order?.customer_id);
    expect(customer).toBeDefined();
    expect(customer?.email).toBe('integration@test.com');
    expect(customer?.stripe_customer_id).toBe('cus_integration_test');
  });
});
