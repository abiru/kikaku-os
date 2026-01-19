import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import storefront from './storefront';

type StorefrontRow = {
  product_id: number;
  product_title: string;
  product_description: string | null;
  variant_id: number;
  variant_title: string;
  sku: string | null;
  price_id: number;
  amount: number;
  currency: string;
  provider_price_id: string | null;
};

const createMockDb = (options: {
  productRows?: StorefrontRow[];
  orderRow?: {
    id: number;
    status: string;
    total_net: number;
    currency: string;
    created_at: string;
    customer_email: string | null;
  } | null;
  orderItems?: Array<{
    product_title: string;
    variant_title: string;
    quantity: number;
    unit_price: number;
  }>;
}) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        all: vi.fn(async () => {
          if (sql.includes('FROM products')) {
            return { results: options.productRows || [] };
          }
          if (sql.includes('FROM order_items')) {
            return { results: options.orderItems || [] };
          }
          return { results: [] };
        }),
        first: vi.fn(async () => {
          if (sql.includes('FROM orders')) {
            return options.orderRow ?? null;
          }
          return null;
        })
      })),
      all: vi.fn(async () => {
        if (sql.includes('FROM products')) {
          return { results: options.productRows || [] };
        }
        return { results: [] };
      })
    }))
  };
};

const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/store', storefront);
  return {
    app,
    fetch: (path: string) =>
      app.request(path, {}, { DB: db } as any)
  };
};

describe('Storefront API', () => {
  describe('GET /store/products', () => {
    it('returns products with variants and prices', async () => {
      const rows: StorefrontRow[] = [
        {
          product_id: 1,
          product_title: 'LED Light',
          product_description: 'A bright LED light',
          variant_id: 10,
          variant_title: 'Red',
          sku: 'LED-001-R',
          price_id: 100,
          amount: 2500,
          currency: 'JPY',
          provider_price_id: 'price_xxx'
        },
        {
          product_id: 1,
          product_title: 'LED Light',
          product_description: 'A bright LED light',
          variant_id: 11,
          variant_title: 'Blue',
          sku: 'LED-001-B',
          price_id: 101,
          amount: 2500,
          currency: 'JPY',
          provider_price_id: 'price_yyy'
        }
      ];

      const db = createMockDb({ productRows: rows });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.products).toHaveLength(1);
      expect(json.products[0].id).toBe(1);
      expect(json.products[0].title).toBe('LED Light');
      expect(json.products[0].variants).toHaveLength(2);
      expect(json.products[0].variants[0].title).toBe('Red');
      expect(json.products[0].variants[1].title).toBe('Blue');
    });

    it('returns empty array when no products', async () => {
      const db = createMockDb({ productRows: [] });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products');
      const json = await res.json();

      expect(json.ok).toBe(true);
      expect(json.products).toEqual([]);
    });

    it('deduplicates variants', async () => {
      const rows: StorefrontRow[] = [
        {
          product_id: 1,
          product_title: 'Product',
          product_description: null,
          variant_id: 10,
          variant_title: 'Default',
          sku: null,
          price_id: 100,
          amount: 1000,
          currency: 'JPY',
          provider_price_id: null
        },
        {
          product_id: 1,
          product_title: 'Product',
          product_description: null,
          variant_id: 10,
          variant_title: 'Default',
          sku: null,
          price_id: 101,
          amount: 1500,
          currency: 'USD',
          provider_price_id: null
        }
      ];

      const db = createMockDb({ productRows: rows });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products');
      const json = await res.json();

      expect(json.products[0].variants).toHaveLength(1);
    });
  });

  describe('GET /store/products/:id', () => {
    it('returns single product with variants', async () => {
      const rows: StorefrontRow[] = [
        {
          product_id: 5,
          product_title: 'Special LED',
          product_description: 'Special edition',
          variant_id: 50,
          variant_title: 'Default',
          sku: 'SPEC-001',
          price_id: 500,
          amount: 5000,
          currency: 'JPY',
          provider_price_id: 'price_spec'
        }
      ];

      const db = createMockDb({ productRows: rows });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products/5');
      const json = await res.json();

      expect(json.ok).toBe(true);
      expect(json.product).not.toBeNull();
      expect(json.product.id).toBe(5);
      expect(json.product.title).toBe('Special LED');
      expect(json.product.variants).toHaveLength(1);
    });

    it('returns null for invalid id (non-numeric)', async () => {
      const db = createMockDb({ productRows: [] });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products/abc');
      const json = await res.json();

      expect(json.ok).toBe(true);
      expect(json.product).toBeNull();
    });

    it('returns null for invalid id (zero)', async () => {
      const db = createMockDb({ productRows: [] });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products/0');
      const json = await res.json();

      expect(json.ok).toBe(true);
      expect(json.product).toBeNull();
    });

    it('returns null for invalid id (negative)', async () => {
      const db = createMockDb({ productRows: [] });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products/-1');
      const json = await res.json();

      expect(json.ok).toBe(true);
      expect(json.product).toBeNull();
    });

    it('returns null for non-existent product', async () => {
      const db = createMockDb({ productRows: [] });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products/999');
      const json = await res.json();

      expect(json.ok).toBe(true);
      expect(json.product).toBeNull();
    });
  });

  describe('GET /store/orders/by-session/:sessionId', () => {
    it('returns order by checkout session ID', async () => {
      const db = createMockDb({
        orderRow: {
          id: 1,
          status: 'paid',
          total_net: 2500,
          currency: 'JPY',
          created_at: '2025-01-15T10:00:00Z',
          customer_email: 'test@example.com'
        },
        orderItems: [
          {
            product_title: 'LED Light',
            variant_title: 'Red',
            quantity: 1,
            unit_price: 2500
          }
        ]
      });
      const { fetch } = createApp(db);

      const res = await fetch('/store/orders/by-session/cs_test_abc123xyz');
      const json = await res.json();

      expect(json.ok).toBe(true);
      expect(json.order).not.toBeNull();
      expect(json.order.id).toBe(1);
      expect(json.order.status).toBe('paid');
      expect(json.order.customer_email).toBe('test@example.com');
      expect(json.order.items).toHaveLength(1);
      expect(json.order.items[0].title).toBe('LED Light - Red');
    });

    it('formats item title without variant when Default', async () => {
      const db = createMockDb({
        orderRow: {
          id: 2,
          status: 'paid',
          total_net: 1000,
          currency: 'JPY',
          created_at: '2025-01-15T10:00:00Z',
          customer_email: null
        },
        orderItems: [
          {
            product_title: 'Simple Product',
            variant_title: 'Default',
            quantity: 2,
            unit_price: 500
          }
        ]
      });
      const { fetch } = createApp(db);

      const res = await fetch('/store/orders/by-session/cs_test_session');
      const json = await res.json();

      expect(json.order.items[0].title).toBe('Simple Product');
    });

    it('returns null for short session ID', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/store/orders/by-session/short');
      const json = await res.json();

      expect(json.ok).toBe(true);
      expect(json.order).toBeNull();
    });

    it('returns null for empty session ID', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/store/orders/by-session/');
      expect(res.status).toBe(404);
    });

    it('returns null when order not found', async () => {
      const db = createMockDb({ orderRow: null });
      const { fetch } = createApp(db);

      const res = await fetch('/store/orders/by-session/cs_nonexistent_session');
      const json = await res.json();

      expect(json.ok).toBe(true);
      expect(json.order).toBeNull();
    });
  });
});
