import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import checkout from './checkout';

const createMockDb = (steps: string[], variantOverride?: Partial<Record<string, unknown>>) => {
  const calls: { sql: string; bind: unknown[] }[] = [];
  const variantRow = {
    variant_id: 10,
    variant_title: 'Standard',
    product_id: 1,
    product_title: 'Sample',
    price_id: 99,
    amount: 1200,
    currency: 'jpy',
    provider_price_id: 'price_test_123',
    ...variantOverride
  };
  return {
    calls,
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (sql.includes('FROM variants')) {
            return variantRow;
          }
          if (sql.includes('FROM customers')) {
            return null;
          }
          return null;
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
    expect(params.get('metadata[order_id]')).toBe('123');
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

  it('rejects missing provider price id', async () => {
    const app = new Hono();
    app.route('/', checkout);

    const steps: string[] = [];
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const env = {
      DB: createMockDb(steps, { provider_price_id: null }),
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
    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
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
    expect(json.message).toMatch('Stripe secret key looks like a publishable key');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
