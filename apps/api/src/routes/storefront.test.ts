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
  categoryRows?: Array<{ category: string | null }>;
  priceRangeRow?: { minPrice: number | null; maxPrice: number | null };
  totalCount?: number;
  productIds?: Array<{ id: number }>;
}) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        all: vi.fn(async () => {
          if (sql.includes('COUNT(DISTINCT p.id)')) {
            // Count query for pagination
            return { results: [] };
          }
          if (sql.includes('SELECT DISTINCT p.id')) {
            // Product IDs query for pagination
            return { results: options.productIds || [] };
          }
          if (sql.includes('FROM products')) {
            return { results: options.productRows || [] };
          }
          if (sql.includes('FROM order_items')) {
            return { results: options.orderItems || [] };
          }
          if (sql.includes('DISTINCT category')) {
            return { results: options.categoryRows || [] };
          }
          return { results: [] };
        }),
        first: vi.fn(async () => {
          if (sql.includes('COUNT(DISTINCT p.id)')) {
            // Count result for pagination
            return { total: options.totalCount ?? 0 };
          }
          if (sql.includes('FROM orders')) {
            return options.orderRow ?? null;
          }
          if (sql.includes('MIN(pr.amount)')) {
            return options.priceRangeRow ?? null;
          }
          return null;
        })
      })),
      all: vi.fn(async () => {
        if (sql.includes('COUNT(DISTINCT p.id)')) {
          return { results: [] };
        }
        if (sql.includes('SELECT DISTINCT p.id')) {
          return { results: options.productIds || [] };
        }
        if (sql.includes('FROM products')) {
          return { results: options.productRows || [] };
        }
        if (sql.includes('DISTINCT category')) {
          return { results: options.categoryRows || [] };
        }
        return { results: [] };
      }),
      first: vi.fn(async () => {
        if (sql.includes('COUNT(DISTINCT p.id)')) {
          return { total: options.totalCount ?? 0 };
        }
        if (sql.includes('MIN(pr.amount)')) {
          return options.priceRangeRow ?? null;
        }
        return null;
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

      const db = createMockDb({
        totalCount: 1,
        productIds: [{ id: 1 }],
        productRows: rows
      });
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

      const db = createMockDb({
        totalCount: 1,
        productIds: [{ id: 1 }],
        productRows: rows
      });
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

  describe('Product Status Filtering', () => {
    it('filters products by active status in product list', async () => {
      const db = createMockDb({ productRows: [] });
      const { fetch } = createApp(db);

      await fetch('/store/products');

      // Verify SQL includes status filter
      const prepareCall = vi.mocked(db.prepare).mock.calls[0];
      const sql = prepareCall[0] as string;
      expect(sql).toContain("p.status = ?");
    });

    it('verifies active status binding in product list', async () => {
      const db = createMockDb({ productRows: [] });
      const { fetch } = createApp(db);

      await fetch('/store/products');

      // Verify bind includes 'active'
      const prepareResult = vi.mocked(db.prepare).mock.results[0];
      const bindCall = prepareResult?.value?.bind?.mock?.calls[0];
      expect(bindCall).toBeDefined();
      expect(bindCall![0]).toBe('active');
    });

    it('filters products by active status in product detail', async () => {
      const db = createMockDb({ productRows: [] });
      const { fetch } = createApp(db);

      await fetch('/store/products/123');

      // Verify SQL includes status filter
      const prepareCall = vi.mocked(db.prepare).mock.calls[0];
      const sql = prepareCall[0] as string;
      expect(sql).toContain("p.status = 'active'");
    });

    it('filters categories by active status', async () => {
      const db = createMockDb({ productRows: [] });
      const { fetch } = createApp(db);

      await fetch('/store/products/filters');

      // Verify category query includes status filter
      const prepareCall = vi.mocked(db.prepare).mock.calls[0];
      const sql = prepareCall[0] as string;
      expect(sql).toContain("status = 'active'");
    });

    it('filters price range by active status', async () => {
      const db = createMockDb({ productRows: [] });
      const { fetch } = createApp(db);

      await fetch('/store/products/filters');

      // Verify price range query includes status filter
      const prepareCall = vi.mocked(db.prepare).mock.calls[1];
      const sql = prepareCall[0] as string;
      expect(sql).toContain("p.status = 'active'");
    });

    it('combines status filter with search query', async () => {
      const db = createMockDb({ productRows: [] });
      const { fetch } = createApp(db);

      await fetch('/store/products?q=LED');

      // Verify both status and search filters are applied
      const prepareCall = vi.mocked(db.prepare).mock.calls[0];
      const sql = prepareCall[0] as string;
      expect(sql).toContain("p.status = ?");
      expect(sql).toContain("p.title LIKE ?");

      const prepareResult = vi.mocked(db.prepare).mock.results[0];
      const bindCall = prepareResult?.value?.bind?.mock?.calls[0];
      expect(bindCall).toBeDefined();
      expect(bindCall![0]).toBe('active');
      expect(bindCall![1]).toBe('%LED%');
    });

    it('combines status filter with category filter', async () => {
      const db = createMockDb({ productRows: [] });
      const { fetch } = createApp(db);

      await fetch('/store/products?category=electronics');

      // Verify both status and category filters are applied
      const prepareResult = vi.mocked(db.prepare).mock.results[0];
      const bindCall = prepareResult?.value?.bind?.mock?.calls[0];
      expect(bindCall).toBeDefined();
      expect(bindCall![0]).toBe('active');
      expect(bindCall![1]).toBe('electronics');
    });
  });

  describe('Pagination', () => {
    it('returns pagination metadata with default page 1 and perPage 20', async () => {
      const rows: StorefrontRow[] = [
        {
          product_id: 1,
          product_title: 'Product 1',
          product_description: null,
          variant_id: 10,
          variant_title: 'Default',
          sku: null,
          price_id: 100,
          amount: 1000,
          currency: 'JPY',
          provider_price_id: null
        }
      ];

      const db = createMockDb({
        totalCount: 45,
        productIds: [{ id: 1 }],
        productRows: rows
      });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products');
      const json = await res.json();

      expect(json.ok).toBe(true);
      expect(json.meta).toBeDefined();
      expect(json.meta.page).toBe(1);
      expect(json.meta.perPage).toBe(20);
      expect(json.meta.totalCount).toBe(45);
      expect(json.meta.totalPages).toBe(3); // ceil(45/20) = 3
    });

    it('respects page and perPage query parameters', async () => {
      const db = createMockDb({
        totalCount: 100,
        productIds: [],
        productRows: []
      });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products?page=2&perPage=10');
      const json = await res.json();

      expect(json.meta.page).toBe(2);
      expect(json.meta.perPage).toBe(10);
      expect(json.meta.totalPages).toBe(10); // ceil(100/10) = 10
    });

    it('enforces maximum perPage of 100', async () => {
      const db = createMockDb({
        totalCount: 200,
        productIds: [],
        productRows: []
      });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products?perPage=500');
      const json = await res.json();

      expect(json.meta.perPage).toBe(100); // Capped at max
      expect(json.meta.totalPages).toBe(2); // ceil(200/100) = 2
    });

    it('enforces minimum page of 1', async () => {
      const db = createMockDb({
        totalCount: 50,
        productIds: [],
        productRows: []
      });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products?page=0');
      const json = await res.json();

      expect(json.meta.page).toBe(1); // Minimum page
    });

    it('returns empty products array when no results on page', async () => {
      const db = createMockDb({
        totalCount: 5,
        productIds: [],
        productRows: []
      });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products?page=10');
      const json = await res.json();

      expect(json.products).toEqual([]);
      expect(json.meta.page).toBe(10);
      expect(json.meta.totalCount).toBe(5);
    });

    it('calculates totalPages correctly for exact division', async () => {
      const db = createMockDb({
        totalCount: 40,
        productIds: [],
        productRows: []
      });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products?perPage=20');
      const json = await res.json();

      expect(json.meta.totalPages).toBe(2); // 40/20 = 2 exactly
    });

    it('preserves filters with pagination', async () => {
      const db = createMockDb({
        totalCount: 10,
        productIds: [{ id: 1 }],
        productRows: [
          {
            product_id: 1,
            product_title: 'Filtered Product',
            product_description: null,
            variant_id: 10,
            variant_title: 'Default',
            sku: null,
            price_id: 100,
            amount: 1500,
            currency: 'JPY',
            provider_price_id: null
          }
        ]
      });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products?category=electronics&minPrice=1000&page=2');
      const json = await res.json();

      expect(json.filters.category).toBe('electronics');
      expect(json.filters.minPrice).toBe(1000);
      expect(json.meta.page).toBe(2);
    });
  });
});
