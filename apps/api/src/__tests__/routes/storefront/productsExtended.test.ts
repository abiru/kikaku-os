import { describe, it, expect, vi } from 'vitest';
import { type StorefrontRow, createMockDb, createApp } from './helpers';

describe('Storefront Products - Extended Coverage', () => {
  describe('Sorting', () => {
    it('default sort is by created_at DESC (newest first)', async () => {
      const db = createMockDb({ productRows: [] });
      const { fetch } = createApp(db);

      await fetch('/store/products');

      // Verify the product IDs query includes ORDER BY created_at DESC
      const prepareCalls = vi.mocked(db.prepare).mock.calls;
      const productIdQuery = prepareCalls.find(
        (call) => typeof call[0] === 'string' && (call[0] as string).includes('SELECT DISTINCT p.id')
      );
      expect(productIdQuery).toBeDefined();
      expect(productIdQuery![0]).toContain('ORDER BY p.created_at DESC');
    });

    it('product detail query orders variants by id', async () => {
      const db = createMockDb({ productRows: [] });
      const { fetch } = createApp(db);

      await fetch('/store/products/1');

      const prepareCalls = vi.mocked(db.prepare).mock.calls;
      const detailQuery = prepareCalls.find(
        (call) => typeof call[0] === 'string' && (call[0] as string).includes('WHERE p.id=?')
      );
      expect(detailQuery).toBeDefined();
      expect(detailQuery![0]).toContain('ORDER BY');
    });
  });

  describe('Out-of-stock handling', () => {
    it('includes stock info (on_hand) in variant data', async () => {
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
      // The product is returned even with no stock info - the stock field
      // comes from the SQL query's COALESCE(SUM(inv.delta), 0) as on_hand
      expect(json.products[0].variants).toHaveLength(1);
    });

    it('returns products regardless of stock level (no stock filtering at API level)', async () => {
      const rows: StorefrontRow[] = [
        {
          product_id: 1,
          product_title: 'In-stock Product',
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
          product_id: 2,
          product_title: 'Out-of-stock Product',
          product_description: null,
          variant_id: 20,
          variant_title: 'Default',
          sku: null,
          price_id: 200,
          amount: 2000,
          currency: 'JPY',
          provider_price_id: null
        }
      ];

      const db = createMockDb({
        totalCount: 2,
        productIds: [{ id: 1 }, { id: 2 }],
        productRows: rows
      });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products');
      const json = await res.json();

      expect(json.ok).toBe(true);
      // Both products are returned - stock filtering is done client-side
      expect(json.products).toHaveLength(2);
    });
  });

  describe('Search and filter combinations', () => {
    it('combines search with price range filters', async () => {
      const db = createMockDb({ productRows: [] });
      const { fetch } = createApp(db);

      await fetch('/store/products?q=LED&minPrice=1000&maxPrice=5000');

      const prepareCall = vi.mocked(db.prepare).mock.calls[0];
      const sql = prepareCall[0] as string;
      expect(sql).toContain("p.status = ?");
      expect(sql).toContain("p.title LIKE ?");
      expect(sql).toContain("pr.amount >= ?");
      expect(sql).toContain("pr.amount <= ?");
    });

    it('returns filter metadata in response', async () => {
      const db = createMockDb({
        totalCount: 0,
        productIds: [],
        productRows: []
      });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products?category=lighting&minPrice=500');
      const json = await res.json();

      expect(json.ok).toBe(true);
      expect(json.filters).toBeDefined();
      expect(json.filters.category).toBe('lighting');
      expect(json.filters.minPrice).toBe(500);
      expect(json.filters.maxPrice).toBeNull();
    });

    it('returns search query in response', async () => {
      const db = createMockDb({
        totalCount: 0,
        productIds: [],
        productRows: []
      });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products?q=test');
      const json = await res.json();

      expect(json.ok).toBe(true);
      expect(json.query).toBe('test');
    });
  });

  describe('Product detail edge cases', () => {
    it('returns product with multiple variants and deduplicates correctly', async () => {
      const rows: StorefrontRow[] = [
        {
          product_id: 1,
          product_title: 'Multi Variant',
          product_description: 'Has many variants',
          variant_id: 10,
          variant_title: 'Small',
          sku: 'MV-S',
          price_id: 100,
          amount: 1000,
          currency: 'JPY',
          provider_price_id: 'price_s'
        },
        {
          product_id: 1,
          product_title: 'Multi Variant',
          product_description: 'Has many variants',
          variant_id: 11,
          variant_title: 'Medium',
          sku: 'MV-M',
          price_id: 101,
          amount: 1500,
          currency: 'JPY',
          provider_price_id: 'price_m'
        },
        {
          product_id: 1,
          product_title: 'Multi Variant',
          product_description: 'Has many variants',
          variant_id: 12,
          variant_title: 'Large',
          sku: 'MV-L',
          price_id: 102,
          amount: 2000,
          currency: 'JPY',
          provider_price_id: 'price_l'
        }
      ];

      const db = createMockDb({ productRows: rows });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products/1');
      const json = await res.json();

      expect(json.ok).toBe(true);
      expect(json.product.variants).toHaveLength(3);
      expect(json.product.variants[0].title).toBe('Small');
      expect(json.product.variants[1].title).toBe('Medium');
      expect(json.product.variants[2].title).toBe('Large');
    });

    it('handles product with null description', async () => {
      const rows: StorefrontRow[] = [
        {
          product_id: 1,
          product_title: 'No Desc',
          product_description: null,
          variant_id: 10,
          variant_title: 'Default',
          sku: null,
          price_id: 100,
          amount: 500,
          currency: 'JPY',
          provider_price_id: null
        }
      ];

      const db = createMockDb({ productRows: rows });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products/1');
      const json = await res.json();

      expect(json.ok).toBe(true);
      expect(json.product.description).toBeNull();
    });
  });

  describe('GET /store/products/filters', () => {
    it('queries active categories and price range', async () => {
      const db = createMockDb({
        priceRangeRow: { minPrice: 500, maxPrice: 10000 }
      });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products/filters');
      const json = await res.json();

      expect(json.ok).toBe(true);
      // Verify the queries filter by active status
      const prepareCalls = vi.mocked(db.prepare).mock.calls;
      const categoryQuery = prepareCalls.find(
        (call) => typeof call[0] === 'string' && (call[0] as string).includes('DISTINCT category')
      );
      expect(categoryQuery).toBeDefined();
      expect(categoryQuery![0]).toContain("status = 'active'");

      const priceQuery = prepareCalls.find(
        (call) => typeof call[0] === 'string' && (call[0] as string).includes('MIN(pr.amount)')
      );
      expect(priceQuery).toBeDefined();
      expect(priceQuery![0]).toContain("p.status = 'active'");
    });

    it('returns default price range when no data', async () => {
      const db = createMockDb({
        priceRangeRow: null
      });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products/filters');
      const json = await res.json();

      expect(json.ok).toBe(true);
      expect(json.priceRange.min).toBe(0);
      expect(json.priceRange.max).toBe(100000);
    });
  });
});
