import { describe, it, expect } from 'vitest';
import { type FeaturedProductRow, createMockDb, createApp } from './helpers';

describe('Storefront API', () => {
  describe('GET /store/home/featured-categories', () => {
    it('returns featured products with R2 image URLs', async () => {
      const featuredProducts: FeaturedProductRow[] = [
        {
          id: 1,
          title: 'Featured Product 1',
          description: 'Great product',
          category: 'electronics',
          r2_key: 'products/product1.jpg'
        },
        {
          id: 2,
          title: 'Featured Product 2',
          description: null,
          category: 'books',
          r2_key: 'products/product2.jpg'
        }
      ];

      const db = createMockDb({ featuredProducts });
      const { fetch } = createApp(db);

      const res = await fetch('/store/home/featured-categories');
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.products).toHaveLength(2);
      expect(json.products[0].id).toBe(1);
      expect(json.products[0].title).toBe('Featured Product 1');
      expect(json.products[0].description).toBe('Great product');
      expect(json.products[0].category).toBe('electronics');
      expect(json.products[0].image).toContain('products%2Fproduct1.jpg');
      expect(json.products[1].description).toBeNull();
    });

    it('returns empty array when no featured products', async () => {
      const db = createMockDb({ featuredProducts: [] });
      const { fetch } = createApp(db);

      const res = await fetch('/store/home/featured-categories');
      const json = await res.json();

      expect(json.ok).toBe(true);
      expect(json.products).toEqual([]);
    });

    it('handles products without images', async () => {
      const featuredProducts: FeaturedProductRow[] = [
        {
          id: 1,
          title: 'No Image Product',
          description: 'Test product',
          category: 'accessories',
          r2_key: null
        }
      ];

      const db = createMockDb({ featuredProducts });
      const { fetch } = createApp(db);

      const res = await fetch('/store/home/featured-categories');
      const json = await res.json();

      expect(json.products[0].image).toBeNull();
      expect(json.products[0].title).toBe('No Image Product');
    });

    it('builds R2 URLs correctly for product images', async () => {
      const featuredProducts: FeaturedProductRow[] = [
        {
          id: 1,
          title: 'Test Product',
          description: 'Test',
          category: 'test',
          r2_key: 'images/test product.jpg'
        }
      ];

      const db = createMockDb({ featuredProducts });
      const { fetch } = createApp(db);

      const res = await fetch('/store/home/featured-categories');
      const json = await res.json();

      // Should properly encode the R2 key with spaces
      expect(json.products[0].image).toMatch(/\/r2\?key=images%2Ftest%20product\.jpg/);
    });

    it('preserves all product fields', async () => {
      const featuredProducts: FeaturedProductRow[] = [
        {
          id: 123,
          title: 'Complete Product',
          description: 'Full description',
          category: 'premium',
          r2_key: 'products/complete.jpg'
        }
      ];

      const db = createMockDb({ featuredProducts });
      const { fetch } = createApp(db);

      const res = await fetch('/store/home/featured-categories');
      const json = await res.json();

      const product = json.products[0];
      expect(product).toHaveProperty('id', 123);
      expect(product).toHaveProperty('title', 'Complete Product');
      expect(product).toHaveProperty('description', 'Full description');
      expect(product).toHaveProperty('category', 'premium');
      expect(product).toHaveProperty('image');
      expect(product.image).toContain('products%2Fcomplete.jpg');
    });
  });
});
