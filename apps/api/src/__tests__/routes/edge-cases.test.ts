import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import checkout from '../../routes/checkout/checkout';
import storefront from '../../routes/storefront/storefront';
import { type StorefrontRow, createMockDb, createApp } from './storefront/helpers';

/**
 * Edge case tests for boundary values, invalid input, and pagination
 */

describe('Edge Cases - Boundary Values', () => {
  describe('Checkout quote validation', () => {
    it('rejects negative quantity in checkout quote', async () => {
      const app = new Hono();
      app.route('/', checkout);

      const res = await app.request('/checkout/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: [{ variantId: 1, quantity: -5 }]
        })
      }, {
        DB: createMockDb({ productRows: [] }),
        STRIPE_SECRET_KEY: 'sk_test_xxx',
        STOREFRONT_BASE_URL: 'http://localhost:4321'
      } as any);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.ok).toBe(false);
    });

    it('rejects zero quantity in checkout quote', async () => {
      const app = new Hono();
      app.route('/', checkout);

      const res = await app.request('/checkout/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: [{ variantId: 1, quantity: 0 }]
        })
      }, {
        DB: createMockDb({ productRows: [] }),
        STRIPE_SECRET_KEY: 'sk_test_xxx',
        STOREFRONT_BASE_URL: 'http://localhost:4321'
      } as any);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.ok).toBe(false);
    });

    it('rejects quantity exceeding 20 items in checkout', async () => {
      const app = new Hono();
      app.route('/', checkout);

      const items = Array.from({ length: 21 }, (_, i) => ({
        variantId: i + 1,
        quantity: 1
      }));

      const res = await app.request('/checkout/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items })
      }, {
        DB: createMockDb({ productRows: [] }),
        STRIPE_SECRET_KEY: 'sk_test_xxx',
        STOREFRONT_BASE_URL: 'http://localhost:4321'
      } as any);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.ok).toBe(false);
      // Error message should mention too many items
      if (json.error && typeof json.error === 'string') {
        expect(json.error.toLowerCase()).toContain('many');
      }
    });

    it('handles maximum variant ID (INT_MAX) without crashing', async () => {
      const app = new Hono();
      app.route('/', checkout);

      const res = await app.request('/checkout/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: [{ variantId: 2147483647, quantity: 1 }]
        })
      }, {
        DB: createMockDb({ productRows: [] }),
        STRIPE_SECRET_KEY: 'sk_test_xxx',
        STOREFRONT_BASE_URL: 'http://localhost:4321'
      } as any);

      // Should not crash, status can be 400, 404, or 200
      expect([200, 400, 404]).toContain(res.status);
      const json = await res.json();
      expect(json).toHaveProperty('ok');
    });
  });

  describe('Storefront product queries', () => {
    it('handles maximum product ID gracefully', async () => {
      const db = createMockDb({ productRows: [] });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products/2147483647');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.product).toBeNull();
    });
  });
});

describe('Edge Cases - Invalid Input', () => {
  describe('Checkout quote validation', () => {
    it('rejects invalid JSON body', async () => {
      const app = new Hono();
      app.route('/', checkout);

      const res = await app.request('/checkout/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{invalid json'
      }, {
        DB: createMockDb({ productRows: [] }),
        STRIPE_SECRET_KEY: 'sk_test_xxx',
        STOREFRONT_BASE_URL: 'http://localhost:4321'
      } as any);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.ok).toBe(false);
      // Error message should mention JSON
      if (json.error && typeof json.error === 'string') {
        expect(json.error.toLowerCase()).toContain('json');
      }
    });

    it('rejects empty items array', async () => {
      const app = new Hono();
      app.route('/', checkout);

      const res = await app.request('/checkout/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: [] })
      }, {
        DB: createMockDb({ productRows: [] }),
        STRIPE_SECRET_KEY: 'sk_test_xxx',
        STOREFRONT_BASE_URL: 'http://localhost:4321'
      } as any);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.ok).toBe(false);
      // Error message should mention items
      if (json.error && typeof json.error === 'string') {
        expect(json.error.toLowerCase()).toContain('item');
      }
    });

    it('rejects missing items field', async () => {
      const app = new Hono();
      app.route('/', checkout);

      const res = await app.request('/checkout/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({})
      }, {
        DB: createMockDb({ productRows: [] }),
        STRIPE_SECRET_KEY: 'sk_test_xxx',
        STOREFRONT_BASE_URL: 'http://localhost:4321'
      } as any);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.ok).toBe(false);
    });

    it('handles non-existent variant ID gracefully', async () => {
      const db = createMockDb({ productRows: [] });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products/999999');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.product).toBeNull();
    });

    it('handles negative variant ID', async () => {
      const db = createMockDb({ productRows: [] });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products/-999');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.product).toBeNull();
    });
  });

  describe('Coupon validation', () => {
    it('rejects empty string coupon code', async () => {
      const app = new Hono();
      app.route('/', checkout);

      const res = await app.request('/checkout/validate-coupon', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: '', cartTotal: 1000 })
      }, {
        DB: createMockDb({ productRows: [] }),
        STRIPE_SECRET_KEY: 'sk_test_xxx',
        STOREFRONT_BASE_URL: 'http://localhost:4321'
      } as any);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.ok).toBe(false);
    });

    it('rejects extremely long coupon code (>50 chars)', async () => {
      const app = new Hono();
      app.route('/', checkout);

      const longCode = 'A'.repeat(51);
      const res = await app.request('/checkout/validate-coupon', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: longCode, cartTotal: 1000 })
      }, {
        DB: createMockDb({ productRows: [] }),
        STRIPE_SECRET_KEY: 'sk_test_xxx',
        STOREFRONT_BASE_URL: 'http://localhost:4321'
      } as any);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.ok).toBe(false);
    });

    it('rejects negative cartTotal in coupon validation', async () => {
      const app = new Hono();
      app.route('/', checkout);

      const res = await app.request('/checkout/validate-coupon', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'VALID', cartTotal: -100 })
      }, {
        DB: createMockDb({ productRows: [] }),
        STRIPE_SECRET_KEY: 'sk_test_xxx',
        STOREFRONT_BASE_URL: 'http://localhost:4321'
      } as any);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.ok).toBe(false);
    });
  });

  describe('SQL injection prevention', () => {
    it('safely handles SQL injection patterns in product search', async () => {
      const db = createMockDb({ productRows: [] });
      const { fetch } = createApp(db);

      // Common SQL injection patterns
      const injectionPatterns = [
        "' OR '1'='1",
        "'; DROP TABLE products; --",
        "1' UNION SELECT * FROM users--"
      ];

      for (const pattern of injectionPatterns) {
        const res = await fetch(`/store/products?q=${encodeURIComponent(pattern)}`);
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.ok).toBe(true);
        // Should return empty results, not error
        expect(json.products).toEqual([]);
      }
    });
  });

  describe('XSS prevention', () => {
    it('handles XSS patterns in search query', async () => {
      const db = createMockDb({ productRows: [] });
      const { fetch } = createApp(db);

      const xssPatterns = [
        '<script>alert("XSS")</script>',
        '<img src=x onerror=alert("XSS")>',
        'javascript:alert("XSS")'
      ];

      for (const pattern of xssPatterns) {
        const res = await fetch(`/store/products?q=${encodeURIComponent(pattern)}`);
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.ok).toBe(true);
        // Should return empty results without executing script
        expect(json.products).toEqual([]);
      }
    });
  });
});

describe('Edge Cases - Pagination', () => {
  it('handles page=0 gracefully (converts to page 1)', async () => {
    const db = createMockDb({
      totalCount: 50,
      productIds: [],
      productRows: []
    });
    const { fetch } = createApp(db);

    const res = await fetch('/store/products?page=0');
    // page=0 passes regex but gets normalized to 1
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.meta.page).toBe(1); // Should normalize to 1
  });

  it('rejects negative page number (validation error)', async () => {
    const db = createMockDb({
      totalCount: 50,
      productIds: [],
      productRows: []
    });
    const { fetch } = createApp(db);

    const res = await fetch('/store/products?page=-5');
    // -5 fails regex validation
    expect(res.status).toBe(400);
  });

  it('handles extremely large page number without crashing', async () => {
    const db = createMockDb({
      totalCount: 10,
      productIds: [],
      productRows: []
    });
    const { fetch } = createApp(db);

    const res = await fetch('/store/products?page=999999');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.products).toEqual([]);
    expect(json.meta.page).toBe(999999);
  });

  it('handles perPage=0 (normalizes to minimum 1)', async () => {
    const db = createMockDb({
      totalCount: 100,
      productIds: [],
      productRows: []
    });
    const { fetch } = createApp(db);

    const res = await fetch('/store/products?perPage=0');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    // Should normalize to minimum of 1
    expect(json.meta.perPage).toBe(1);
  });

  it('rejects negative perPage (validation error)', async () => {
    const db = createMockDb({
      totalCount: 100,
      productIds: [],
      productRows: []
    });
    const { fetch } = createApp(db);

    const res = await fetch('/store/products?perPage=-10');
    // -10 fails regex validation
    expect(res.status).toBe(400);
  });

  it('rejects non-numeric page parameter', async () => {
    const db = createMockDb({
      totalCount: 50,
      productIds: [],
      productRows: []
    });
    const { fetch } = createApp(db);

    const res = await fetch('/store/products?page=abc');
    // abc fails regex validation
    expect(res.status).toBe(400);
  });

  it('rejects non-numeric perPage parameter', async () => {
    const db = createMockDb({
      totalCount: 50,
      productIds: [],
      productRows: []
    });
    const { fetch } = createApp(db);

    const res = await fetch('/store/products?perPage=xyz');
    // xyz fails regex validation
    expect(res.status).toBe(400);
  });

  it('handles extremely large perPage (caps at maximum)', async () => {
    const db = createMockDb({
      totalCount: 200,
      productIds: [],
      productRows: []
    });
    const { fetch } = createApp(db);

    const res = await fetch('/store/products?perPage=99999');
    const json = await res.json();

    expect(json.ok).toBe(true);
    // Should cap at maximum (100)
    expect(json.meta.perPage).toBe(100);
  });
});

describe('Edge Cases - Special Characters', () => {
  it('handles Unicode characters in search query', async () => {
    const rows: StorefrontRow[] = [
      {
        product_id: 1,
        product_title: '日本語商品名',
        product_description: 'Japanese product',
        variant_id: 10,
        variant_title: 'デフォルト',
        sku: 'JP-001',
        price_id: 100,
        amount: 1000,
        currency: 'JPY',
        provider_price_id: null
      }
    ];

    const db = createMockDb({
      totalCount: 1,
      productIds: [{ id: 1 }],
      productRows: rows
    });
    const { fetch } = createApp(db);

    const res = await fetch(`/store/products?q=${encodeURIComponent('日本語')}`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it('handles emoji in search query', async () => {
    const db = createMockDb({
      totalCount: 0,
      productIds: [],
      productRows: []
    });
    const { fetch } = createApp(db);

    const res = await fetch(`/store/products?q=${encodeURIComponent('🔥💡')}`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it('rejects extremely long search query (>100 chars)', async () => {
    const db = createMockDb({
      totalCount: 0,
      productIds: [],
      productRows: []
    });
    const { fetch } = createApp(db);

    const longQuery = 'A'.repeat(1000);
    const res = await fetch(`/store/products?q=${encodeURIComponent(longQuery)}`);
    // Should fail validation (max 100 chars)
    expect(res.status).toBe(400);
  });

  it('handles search query at max length (100 chars)', async () => {
    const db = createMockDb({
      totalCount: 0,
      productIds: [],
      productRows: []
    });
    const { fetch } = createApp(db);

    const maxQuery = 'A'.repeat(100);
    const res = await fetch(`/store/products?q=${encodeURIComponent(maxQuery)}`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
