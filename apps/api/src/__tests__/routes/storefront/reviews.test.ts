import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import reviews from '../../../routes/storefront/reviews';

const createMockDb = (options?: {
  reviewRows?: Array<{
    id: number;
    customer_name: string;
    rating: number;
    title: string;
    body: string;
    created_at: string;
  }>;
  avgResult?: { avg_rating: number | null; review_count: number };
  productRow?: { id: number; title: string } | null;
}) => {
  const calls: { sql: string; bind: unknown[] }[] = [];
  return {
    calls,
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => {
        calls.push({ sql, bind: args });
        return {
          run: async () => ({ meta: { last_row_id: 1, changes: 1 } }),
          all: async () => ({
            results: options?.reviewRows ?? [],
          }),
          first: async () => {
            if (sql.includes('AVG(rating)')) {
              return options?.avgResult ?? { avg_rating: null, review_count: 0 };
            }
            if (sql.includes('FROM products WHERE')) {
              return options?.productRow ?? null;
            }
            return null;
          },
        };
      },
    }),
  };
};

const createEnv = (db = createMockDb()) => ({
  DB: db,
} as any);

describe('GET /store/products/:id/reviews', () => {
  it('returns approved reviews with average rating and count', async () => {
    const app = new Hono();
    app.route('/store', reviews);
    const env = createEnv(
      createMockDb({
        reviewRows: [
          {
            id: 1,
            customer_name: 'Taro',
            rating: 5,
            title: 'Great',
            body: 'Excellent product',
            created_at: '2026-01-01T00:00:00Z',
          },
          {
            id: 2,
            customer_name: 'Hanako',
            rating: 4,
            title: 'Good',
            body: 'Nice quality',
            created_at: '2026-01-02T00:00:00Z',
          },
        ],
        avgResult: { avg_rating: 4.5, review_count: 2 },
      })
    );

    const res = await app.request(
      'http://localhost/store/products/1/reviews',
      { method: 'GET' },
      env
    );

    const json: any = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.reviews).toHaveLength(2);
    expect(json.reviews[0].customer_name).toBe('Taro');
    expect(json.reviews[1].customer_name).toBe('Hanako');
    expect(json.averageRating).toBe(4.5);
    expect(json.reviewCount).toBe(2);
  });

  it('returns empty array when no reviews', async () => {
    const app = new Hono();
    app.route('/store', reviews);
    const env = createEnv(
      createMockDb({
        reviewRows: [],
        avgResult: { avg_rating: null, review_count: 0 },
      })
    );

    const res = await app.request(
      'http://localhost/store/products/1/reviews',
      { method: 'GET' },
      env
    );

    const json: any = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.reviews).toEqual([]);
    expect(json.averageRating).toBeNull();
    expect(json.reviewCount).toBe(0);
  });

  it('queries only approved reviews', async () => {
    const app = new Hono();
    app.route('/store', reviews);
    const db = createMockDb();
    const env = createEnv(db);

    await app.request(
      'http://localhost/store/products/42/reviews',
      { method: 'GET' },
      env
    );

    // First call: SELECT reviews
    expect(db.calls[0].sql).toContain("status = 'approved'");
    expect(db.calls[0].bind).toEqual([42]);

    // Second call: AVG(rating)
    expect(db.calls[1].sql).toContain('AVG(rating)');
    expect(db.calls[1].sql).toContain("status = 'approved'");
    expect(db.calls[1].bind).toEqual([42]);
  });

  it('rounds average rating to one decimal place', async () => {
    const app = new Hono();
    app.route('/store', reviews);
    const env = createEnv(
      createMockDb({
        avgResult: { avg_rating: 3.666666, review_count: 3 },
      })
    );

    const res = await app.request(
      'http://localhost/store/products/1/reviews',
      { method: 'GET' },
      env
    );

    const json: any = await res.json();
    expect(json.averageRating).toBe(3.7);
  });

  it('returns 400 for invalid product id', async () => {
    const app = new Hono();
    app.route('/store', reviews);
    const env = createEnv();

    const res = await app.request(
      'http://localhost/store/products/abc/reviews',
      { method: 'GET' },
      env
    );

    expect(res.status).toBe(400);
    const json: any = await res.json();
    expect(json.ok).toBe(false);
  });
});

describe('POST /store/products/:id/reviews', () => {
  const validReview = {
    name: 'Taro Yamada',
    email: 'taro@example.com',
    rating: 5,
    title: 'Great product',
    body: 'I love this LED light!',
  };

  it('creates review with valid data and returns id', async () => {
    const app = new Hono();
    app.route('/store', reviews);
    const db = createMockDb({
      productRow: { id: 1, title: 'LED Light' },
    });
    const env = createEnv(db);

    const res = await app.request(
      'http://localhost/store/products/1/reviews',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validReview),
      },
      env
    );

    const json: any = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.id).toBe(1);
  });

  it('inserts review with pending status', async () => {
    const app = new Hono();
    app.route('/store', reviews);
    const db = createMockDb({
      productRow: { id: 1, title: 'LED Light' },
    });
    const env = createEnv(db);

    await app.request(
      'http://localhost/store/products/1/reviews',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validReview),
      },
      env
    );

    // First call: SELECT product
    expect(db.calls[0].sql).toContain('FROM products WHERE');
    expect(db.calls[0].bind).toEqual([1]);

    // Second call: INSERT INTO reviews with pending status
    expect(db.calls[1].sql).toContain('INSERT INTO reviews');
    expect(db.calls[1].sql).toContain("'pending'");
    expect(db.calls[1].bind).toEqual([
      1,
      'taro@example.com',
      'Taro Yamada',
      5,
      'Great product',
      'I love this LED light!',
    ]);
  });

  it('creates inbox item for admin review', async () => {
    const app = new Hono();
    app.route('/store', reviews);
    const db = createMockDb({
      productRow: { id: 1, title: 'LED Light' },
    });
    const env = createEnv(db);

    await app.request(
      'http://localhost/store/products/1/reviews',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validReview),
      },
      env
    );

    // Third call: INSERT INTO inbox_items
    expect(db.calls[2].sql).toContain('INSERT INTO inbox_items');
    expect(db.calls[2].sql).toContain("'product_review'");
    expect(db.calls[2].bind[0]).toContain('LED Light');
    expect(db.calls[2].bind[0]).toContain('5');
    expect(db.calls[2].bind[1]).toContain('Taro Yamada');
    expect(db.calls[2].bind[1]).toContain('taro@example.com');

    // Verify metadata JSON
    const metadata = JSON.parse(db.calls[2].bind[2] as string);
    expect(metadata.review_id).toBe(1);
    expect(metadata.product_id).toBe(1);
    expect(metadata.rating).toBe(5);
    expect(metadata.customer_name).toBe('Taro Yamada');
  });

  it('returns 404 when product not found', async () => {
    const app = new Hono();
    app.route('/store', reviews);
    const env = createEnv(
      createMockDb({ productRow: null })
    );

    const res = await app.request(
      'http://localhost/store/products/999/reviews',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validReview),
      },
      env
    );

    expect(res.status).toBe(404);
    const json: any = await res.json();
    expect(json.ok).toBe(false);
    expect(json.message).toBe('Product not found');
  });

  it('returns validation error for missing required fields', async () => {
    const app = new Hono();
    app.route('/store', reviews);
    const env = createEnv();

    const res = await app.request(
      'http://localhost/store/products/1/reviews',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Taro' }),
      },
      env
    );

    expect(res.status).toBe(400);
    const json: any = await res.json();
    expect(json.ok).toBe(false);
  });

  it('returns validation error for invalid rating below 1', async () => {
    const app = new Hono();
    app.route('/store', reviews);
    const env = createEnv();

    const res = await app.request(
      'http://localhost/store/products/1/reviews',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...validReview, rating: 0 }),
      },
      env
    );

    expect(res.status).toBe(400);
    const json: any = await res.json();
    expect(json.ok).toBe(false);
  });

  it('returns validation error for invalid rating above 5', async () => {
    const app = new Hono();
    app.route('/store', reviews);
    const env = createEnv();

    const res = await app.request(
      'http://localhost/store/products/1/reviews',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...validReview, rating: 6 }),
      },
      env
    );

    expect(res.status).toBe(400);
    const json: any = await res.json();
    expect(json.ok).toBe(false);
  });

  it('returns validation error for invalid email', async () => {
    const app = new Hono();
    app.route('/store', reviews);
    const env = createEnv();

    const res = await app.request(
      'http://localhost/store/products/1/reviews',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...validReview, email: 'not-an-email' }),
      },
      env
    );

    expect(res.status).toBe(400);
    const json: any = await res.json();
    expect(json.ok).toBe(false);
  });

  it('returns validation error for empty body', async () => {
    const app = new Hono();
    app.route('/store', reviews);
    const env = createEnv();

    const res = await app.request(
      'http://localhost/store/products/1/reviews',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...validReview, body: '' }),
      },
      env
    );

    expect(res.status).toBe(400);
    const json: any = await res.json();
    expect(json.ok).toBe(false);
  });

  it('returns 400 for invalid product id', async () => {
    const app = new Hono();
    app.route('/store', reviews);
    const env = createEnv();

    const res = await app.request(
      'http://localhost/store/products/abc/reviews',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validReview),
      },
      env
    );

    expect(res.status).toBe(400);
    const json: any = await res.json();
    expect(json.ok).toBe(false);
  });
});
