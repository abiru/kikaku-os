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
    image_r2_key: null,
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

  it('creates Stripe product with image when image is present', async () => {
    const app = new Hono();
    app.route('/', checkout);

    const steps: string[] = [];
    let productCreateBody = '';
    const fetchMock = vi.fn(async (url: string, options?: any) => {
      // First call: create Stripe product (with image)
      if (url === 'https://api.stripe.com/v1/products') {
        productCreateBody = options?.body || '';
        steps.push('stripe-create-product-with-image');
        return {
          ok: true,
          json: async () => ({ id: 'prod_with_image_123', object: 'product' }),
          text: async () => ''
        } as Response;
      }
      // Second call: create Stripe price
      if (url === 'https://api.stripe.com/v1/prices') {
        steps.push('stripe-create-price');
        return {
          ok: true,
          json: async () => ({ id: 'price_with_image_456', object: 'price' }),
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
        {
          provider_price_id: null,
          provider_product_id: null,
          image_r2_key: 'product-images/test-image-uuid.jpg'
        },
        true,
        { provider_product_id: null }
      ),
      STRIPE_SECRET_KEY: 'sk_test_123',
      STOREFRONT_BASE_URL: 'https://example.com'
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
    expect(steps).toContain('stripe-create-product-with-image');

    // Verify image URL was included in Stripe product creation
    // Image URL uses the API's origin (from request URL), not STOREFRONT_BASE_URL
    const params = new URLSearchParams(productCreateBody);
    expect(params.get('images[0]')).toBe('http://localhost/r2?key=product-images%2Ftest-image-uuid.jpg');
  });

  it('creates Stripe product without image when image is null', async () => {
    const app = new Hono();
    app.route('/', checkout);

    const steps: string[] = [];
    let productCreateBody = '';
    const fetchMock = vi.fn(async (url: string, options?: any) => {
      if (url === 'https://api.stripe.com/v1/products') {
        productCreateBody = options?.body || '';
        steps.push('stripe-create-product-no-image');
        return {
          ok: true,
          json: async () => ({ id: 'prod_no_image_123', object: 'product' }),
          text: async () => ''
        } as Response;
      }
      if (url === 'https://api.stripe.com/v1/prices') {
        return {
          ok: true,
          json: async () => ({ id: 'price_no_image_456', object: 'price' }),
          text: async () => ''
        } as Response;
      }
      if (url === 'https://api.stripe.com/v1/checkout/sessions') {
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
        {
          provider_price_id: null,
          provider_product_id: null,
          image_r2_key: null  // No image
        },
        true,
        { provider_product_id: null }
      ),
      STRIPE_SECRET_KEY: 'sk_test_123',
      STOREFRONT_BASE_URL: 'https://example.com'
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

    // Verify image URL was NOT included in Stripe product creation
    const params = new URLSearchParams(productCreateBody);
    expect(params.get('images[0]')).toBeNull();
  });

  describe('Product Status Validation', () => {
    it('rejects checkout for archived product (returns empty variant list)', async () => {
      const app = new Hono();
      app.route('/', checkout);

      const steps: string[] = [];
      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      // Mock DB that returns empty results (simulating archived product filtered out)
      const env = {
        DB: createMockDb(steps, null, false),
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
      expect(res.status).toBe(404);
      expect(json.error?.code).toBe('VARIANT_NOT_FOUND');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('verifies SQL includes status filter in variant query', async () => {
      const app = new Hono();
      app.route('/', checkout);

      const steps: string[] = [];
      const fetchMock = vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: 'cs_test_123', url: 'https://checkout.stripe.test/session' }),
        text: async () => ''
      } as Response));

      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const mockDb = createMockDb(steps);
      const prepareSpy = vi.spyOn(mockDb, 'prepare');

      const env = {
        DB: mockDb,
        STRIPE_SECRET_KEY: 'sk_test_123',
        STOREFRONT_BASE_URL: 'http://localhost:4321'
      } as any;

      await app.request(
        'http://localhost/checkout/session',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ variantId: 10, quantity: 1 })
        },
        env
      );

      // Verify variant query includes status filter
      const variantQuery = prepareSpy.mock.calls.find(call =>
        (call[0] as string).includes('FROM variants v')
      );
      expect(variantQuery).toBeDefined();
      expect(variantQuery![0]).toContain("p.status = 'active'");
    });

    it('allows checkout for active product', async () => {
      const app = new Hono();
      app.route('/', checkout);

      const steps: string[] = [];
      const fetchMock = vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: 'cs_test_123', url: 'https://checkout.stripe.test/session' }),
        text: async () => ''
      } as Response));

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
          body: JSON.stringify({ variantId: 10, quantity: 1 })
        },
        env
      );

      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.url).toBe('https://checkout.stripe.test/session');
    });

    it('rejects multi-item checkout when one product is archived (variant not found)', async () => {
      const app = new Hono();
      app.route('/', checkout);

      const steps: string[] = [];
      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      // Create a custom mock DB that only returns variant 10, not variant 20 (simulating archived filter)
      const mockDb = {
        prepare: vi.fn((sql: string) => ({
          bind: vi.fn((..._args: unknown[]) => ({
            all: vi.fn(async () => {
              if (sql.includes('FROM variants v')) {
                // Only return variant 10 (variant 20 is archived and filtered out by status check)
                return {
                  results: [{
                    variant_id: 10,
                    variant_title: 'Standard',
                    product_id: 1,
                    product_title: 'Sample',
                    price_id: 99,
                    amount: 1200,
                    currency: 'jpy',
                    provider_price_id: 'price_test_123',
                    provider_product_id: 'prod_test_123',
                    image_r2_key: null,
                  }]
                };
              }
              return { results: [] };
            }),
            first: vi.fn(async () => null),
            run: vi.fn(async () => ({ meta: { last_row_id: 1, changes: 1 } }))
          }))
        }))
      };

      const env = {
        DB: mockDb,
        STRIPE_SECRET_KEY: 'sk_test_123',
        STOREFRONT_BASE_URL: 'http://localhost:4321'
      } as any;

      const res = await app.request(
        'http://localhost/checkout/session',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            items: [
              { variantId: 10, quantity: 1 },
              { variantId: 20, quantity: 1 }  // This will be filtered out by status check
            ]
          })
        },
        env
      );

      const json = await res.json();
      expect(res.status).toBe(404);
      expect(json.error?.code).toBe('VARIANT_NOT_FOUND');
      expect(json.error?.message).toContain('20');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
