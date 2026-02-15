import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import reviews from '../../../routes/storefront/reviews';

const createMockDb = (options: {
  reviews?: any[];
  avgResult?: { avg_rating: number | null; review_count: number };
  product?: any | null;
  insertId?: number;
  shouldFail?: boolean;
} = {}) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        all: vi.fn(async () => {
          if (options.shouldFail) {
            throw new Error('Mock DB error');
          }
          if (sql.includes('FROM reviews') && sql.includes('ORDER BY')) {
            return { results: options.reviews || [] };
          }
          return { results: [] };
        }),
        first: vi.fn(async () => {
          if (options.shouldFail) {
            throw new Error('Mock DB error');
          }
          if (sql.includes('AVG(rating)')) {
            return options.avgResult ?? { avg_rating: null, review_count: 0 };
          }
          if (sql.includes('FROM products WHERE id')) {
            return options.product ?? null;
          }
          return null;
        }),
        run: vi.fn(async () => {
          if (options.shouldFail) {
            throw new Error('Mock DB error');
          }
          return {
            meta: { last_row_id: options.insertId || 1, changes: 1 },
          };
        }),
      })),
    })),
  };
};

const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/store', reviews);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, { DB: db } as any),
  };
};

describe('Reviews Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /store/products/:id/reviews', () => {
    it('returns approved reviews for a product', async () => {
      const reviewList = [
        {
          id: 1,
          customer_name: 'Taro',
          rating: 5,
          title: 'Great product',
          body: 'Very satisfied!',
          created_at: '2026-01-13T00:00:00Z',
        },
        {
          id: 2,
          customer_name: 'Hanako',
          rating: 4,
          title: 'Good quality',
          body: 'Nice item',
          created_at: '2026-01-14T00:00:00Z',
        },
      ];

      const db = createMockDb({
        reviews: reviewList,
        avgResult: { avg_rating: 4.5, review_count: 2 },
      });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products/1/reviews');

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.reviews).toHaveLength(2);
      expect(data.averageRating).toBe(4.5);
      expect(data.reviewCount).toBe(2);
    });

    it('returns null average when no reviews', async () => {
      const db = createMockDb({
        reviews: [],
        avgResult: { avg_rating: null, review_count: 0 },
      });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products/1/reviews');

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.reviews).toHaveLength(0);
      expect(data.averageRating).toBeNull();
      expect(data.reviewCount).toBe(0);
    });

    it('rounds average rating to one decimal', async () => {
      const db = createMockDb({
        reviews: [{ id: 1, customer_name: 'Test', rating: 3, title: 'Ok', body: 'Okay', created_at: '2026-01-13' }],
        avgResult: { avg_rating: 3.666666, review_count: 3 },
      });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products/1/reviews');

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.averageRating).toBe(3.7);
    });

    it('rejects non-numeric product id', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/store/products/abc/reviews');

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
    });

    it('handles database errors', async () => {
      const db = createMockDb({ shouldFail: true });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products/1/reviews');

      expect(res.status).toBe(500);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
      expect(data.message).toContain('Failed to fetch reviews');
    });
  });

  describe('POST /store/products/:id/reviews', () => {
    it('submits a review successfully', async () => {
      const db = createMockDb({
        product: { id: 1, title: 'Test Product' },
        insertId: 42,
      });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products/1/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Taro Yamada',
          email: 'taro@example.com',
          rating: 5,
          title: 'Excellent product',
          body: 'Really love this item, highly recommended!',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.id).toBeDefined();
    });

    it('creates inbox item for admin approval', async () => {
      const db = createMockDb({
        product: { id: 1, title: 'Test Product' },
        insertId: 42,
      });
      const { fetch } = createApp(db);

      await fetch('/store/products/1/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Taro',
          email: 'taro@example.com',
          rating: 4,
          title: 'Good',
          body: 'Nice product',
        }),
      });

      // Verify INSERT INTO inbox_items was called
      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO inbox_items')
      );
    });

    it('returns 404 for non-existent product', async () => {
      const db = createMockDb({ product: null });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products/999/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Taro',
          email: 'taro@example.com',
          rating: 5,
          title: 'Great',
          body: 'Awesome product',
        }),
      });

      expect(res.status).toBe(404);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
      expect(data.message).toContain('Product not found');
    });

    it('validates required name field', async () => {
      const db = createMockDb({ product: { id: 1, title: 'Test' } });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products/1/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '',
          email: 'taro@example.com',
          rating: 5,
          title: 'Great',
          body: 'Good product',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
    });

    it('validates email format', async () => {
      const db = createMockDb({ product: { id: 1, title: 'Test' } });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products/1/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Taro',
          email: 'not-an-email',
          rating: 5,
          title: 'Great',
          body: 'Good product',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
    });

    it('validates rating range (1-5)', async () => {
      const db = createMockDb({ product: { id: 1, title: 'Test' } });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products/1/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Taro',
          email: 'taro@example.com',
          rating: 6,
          title: 'Great',
          body: 'Good product',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
    });

    it('rejects rating of 0', async () => {
      const db = createMockDb({ product: { id: 1, title: 'Test' } });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products/1/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Taro',
          email: 'taro@example.com',
          rating: 0,
          title: 'Bad',
          body: 'Terrible product',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('validates required title field', async () => {
      const db = createMockDb({ product: { id: 1, title: 'Test' } });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products/1/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Taro',
          email: 'taro@example.com',
          rating: 5,
          title: '',
          body: 'Good product',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('validates required body field', async () => {
      const db = createMockDb({ product: { id: 1, title: 'Test' } });
      const { fetch } = createApp(db);

      const res = await fetch('/store/products/1/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Taro',
          email: 'taro@example.com',
          rating: 5,
          title: 'Great',
          body: '',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('handles database errors on submission', async () => {
      const db = createMockDb({
        product: { id: 1, title: 'Test' },
        shouldFail: true,
      });

      // Override first mock to succeed for product check, fail for insert
      const originalPrepare = db.prepare;
      let callCount = 0;
      db.prepare = vi.fn((sql: string) => {
        callCount++;
        if (callCount === 1 && sql.includes('FROM products')) {
          return {
            bind: vi.fn(() => ({
              first: vi.fn(async () => ({ id: 1, title: 'Test' })),
              all: vi.fn(async () => ({ results: [] })),
              run: vi.fn(async () => ({ meta: { last_row_id: 1, changes: 1 } })),
            })),
          } as any;
        }
        return originalPrepare(sql);
      });

      const { fetch } = createApp(db);

      const res = await fetch('/store/products/1/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Taro',
          email: 'taro@example.com',
          rating: 5,
          title: 'Great',
          body: 'Good product',
        }),
      });

      expect(res.status).toBe(500);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
      expect(data.message).toContain('Failed to submit review');
    });
  });
});
