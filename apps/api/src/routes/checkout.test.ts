import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import checkout from './checkout';

const createMockDb = (
  steps: string[],
  variantOverride?: Partial<Record<string, unknown>> | null,
  variantExists = true,
  productOverride?: Partial<Record<string, unknown>> | null
) => {
  const calls: { sql: string; bind: unknown[] }[] = [];
  const baseVariantRow = {
    variant_id: 10,
    variant_title: 'Standard',
    product_id: 1,
    product_title: 'Sample',
    price_id: 99,
    amount: 1200,
    currency: 'jpy',
    provider_price_id: 'price_test_123',
    provider_product_id: 'prod_test_123',
  };
  const baseProductRow = {
    id: 1,
    title: 'Sample',
    description: 'A sample product',
    provider_product_id: 'prod_test_123',
  };
  const variantRow = variantOverride === null ? null : { ...baseVariantRow, ...variantOverride };
  const productRow = productOverride === null ? null : { ...baseProductRow, ...productOverride };
  const variantId = (variantRow?.variant_id ?? baseVariantRow.variant_id) as number;
  return {
    calls,
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (sql.includes('FROM variants v')) {
            return variantRow;
          }
          if (sql.includes('FROM variants WHERE')) {
            return variantExists ? { id: variantId } : null;
          }
          if (sql.includes('FROM customers')) {
            return null;
          }
          if (sql.includes('FROM products WHERE')) {
            return productRow;
          }
          return null;
        },
        all: async () => {
          // For multi-item checkout query
          if (sql.includes('FROM variants v')) {
            return { results: variantRow ? [variantRow] : [] };
          }
          return { results: [] };
        },
        run: async () => {
          calls.push({ sql, bind: args });
          if (sql.includes('INSERT INTO orders')) {
            steps.push('insert-order');
          }
          if (sql.includes('INSERT INTO orders')) {
            return { meta: { last_row_id: 123, changes: 1 } };
          }
          if (sql.includes('INSERT INTO customers')) {
            return { meta: { last_row_id: 77, changes: 1 } };
          }
          return { meta: { last_row_id: 1, changes: 1 } };
        }
      })
    })
  };
};

describe('POST /checkout/session', () => {
  it('creates checkout session and returns url', async () => {
    const app = new Hono();
    app.route('/', checkout);

    const steps: string[] = [];
    const fetchMock = vi.fn(async () => {
      steps.push('stripe-fetch');
      return {
        ok: true,
        json: async () => ({ id: 'cs_test_123', url: 'https://checkout.stripe.test/session' }),
        text: async () => ''
      } as Response;
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const env = {
      DB: createMockDb(steps),
      STRIPE_SECRET_KEY: 'sk_test_123',
      STOREFRONT_BASE_URL: 'http://localhost:4321'
    } as any;

    const res = await app.request(
      'http://localhost/checkout/session',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ variantId: 10, quantity: 2 })
      },
      env
    );

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.url).toBe('https://checkout.stripe.test/session');
    expect(json.orderId).toBe(123);

    const stripeCall = fetchMock.mock.calls[0];
    const body = String(stripeCall[1]?.body || '');
    const params = new URLSearchParams(body);
    expect(params.get('line_items[0][price]')).toBe('price_test_123');
    expect(params.get('line_items[0][quantity]')).toBe('2');
    expect(params.get('metadata[orderId]')).toBe('123');
    expect(params.get('metadata[order_id]')).toBe('123');
    expect(params.get('payment_intent_data[metadata][orderId]')).toBe('123');
    expect(params.get('payment_intent_data[metadata][order_id]')).toBe('123');
    expect(steps.indexOf('insert-order')).toBeGreaterThan(-1);
    expect(steps.indexOf('insert-order')).toBeLessThan(steps.indexOf('stripe-fetch'));
  });

  it('rejects invalid quantity', async () => {
    const app = new Hono();
    app.route('/', checkout);

    const steps: string[] = [];
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const env = {
      DB: createMockDb(steps),
      STRIPE_SECRET_KEY: 'sk_test_123',
      STOREFRONT_BASE_URL: 'http://localhost:4321'
    } as any;

    const res = await app.request(
      'http://localhost/checkout/session',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ variantId: 10, quantity: 0 })
      },
      env
    );

    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('auto-creates Stripe price when missing', async () => {
    const app = new Hono();
    app.route('/', checkout);

    const steps: string[] = [];
    let fetchCallCount = 0;
    const fetchMock = vi.fn(async (url: string) => {
      fetchCallCount++;
      // First call: create Stripe product
      if (url === 'https://api.stripe.com/v1/products') {
        steps.push('stripe-create-product');
        return {
          ok: true,
          json: async () => ({ id: 'prod_auto_123', object: 'product' }),
          text: async () => ''
        } as Response;
      }
      // Second call: create Stripe price
      if (url === 'https://api.stripe.com/v1/prices') {
        steps.push('stripe-create-price');
        return {
          ok: true,
          json: async () => ({ id: 'price_auto_456', object: 'price' }),
          text: async () => ''
        } as Response;
      }
      // Third call: create checkout session
      if (url === 'https://api.stripe.com/v1/checkout/sessions') {
        steps.push('stripe-checkout');
        return {
          ok: true,
          json: async () => ({ id: 'cs_test_123', url: 'https://checkout.stripe.test/session' }),
          text: async () => ''
        } as Response;
      }
      return { ok: false, text: async () => 'Unknown endpoint' } as Response;
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const env = {
      DB: createMockDb(
        steps,
        { provider_price_id: null, provider_product_id: null },
        true,
        { provider_product_id: null }
      ),
      STRIPE_SECRET_KEY: 'sk_test_123',
      STOREFRONT_BASE_URL: 'http://localhost:4321'
    } as any;

    const res = await app.request(
      'http://localhost/checkout/session',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ variantId: 10, quantity: 1 })
      },
      env
    );

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.url).toBe('https://checkout.stripe.test/session');
    expect(steps).toContain('stripe-create-product');
    expect(steps).toContain('stripe-create-price');
    expect(steps).toContain('stripe-checkout');
  });

  it('rejects missing stripe secret key', async () => {
    const app = new Hono();
    app.route('/', checkout);

    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const env = {
      DB: createMockDb([]),
      STOREFRONT_BASE_URL: 'http://localhost:4321'
    } as any;

    const res = await app.request(
      'http://localhost/checkout/session',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ variantId: 10, quantity: 1 })
      },
      env
    );

    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.message).toBe('Stripe API key not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects publishable key in stripe secret key', async () => {
    const app = new Hono();
    app.route('/', checkout);

    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const env = {
      DB: createMockDb([]),
      STRIPE_SECRET_KEY: 'pk_test_123',
      STOREFRONT_BASE_URL: 'http://localhost:4321'
    } as any;

    const res = await app.request(
      'http://localhost/checkout/session',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ variantId: 10, quantity: 1 })
      },
      env
    );

    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.message).toContain('publishable key');
    expect(json.error?.code).toBe('STRIPE_SECRET_KEY_INVALID');
    expect(json.error?.message).toContain('publishable key');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unknown variant', async () => {
    const app = new Hono();
    app.route('/', checkout);

    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const env = {
      DB: createMockDb([], null, false),
      STRIPE_SECRET_KEY: 'sk_test_123',
      STOREFRONT_BASE_URL: 'http://localhost:4321'
    } as any;

    const res = await app.request(
      'http://localhost/checkout/session',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ variantId: 999, quantity: 1 })
      },
      env
    );

    const json = await res.json();
    expect(res.status).toBe(404);
    expect(json.error?.code).toBe('VARIANT_NOT_FOUND');
    expect(json.error?.message).toContain('Variant');
    expect(json.error?.message).toContain('not found');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
