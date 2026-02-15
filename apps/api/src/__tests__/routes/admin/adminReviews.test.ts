import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import adminReviews from '../../../routes/admin/adminReviews';

vi.mock('../../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
}));

vi.mock('../../../middleware/rbac', () => ({
  loadRbac: async (_c: any, next: any) => next(),
  requirePermission: () => async (_c: any, next: any) => next(),
}));

const ADMIN_KEY = 'test-admin-key';

const createMockDb = (options: {
  reviews?: any[];
  review?: any | null;
  total?: number;
}) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        all: vi.fn(async () => {
          if (sql.includes('FROM reviews')) {
            return { results: options.reviews || [] };
          }
          return { results: [] };
        }),
        first: vi.fn(async () => {
          if (sql.includes('COUNT(*)')) {
            return { total: options.total ?? 0 };
          }
          if (sql.includes('FROM reviews')) {
            return options.review ?? null;
          }
          return null;
        }),
        run: vi.fn(async () => ({ meta: { last_row_id: 1 } })),
      })),
    })),
  };
};

const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/admin', adminReviews);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, { DB: db, ADMIN_API_KEY: ADMIN_KEY } as any),
  };
};

describe('Admin Reviews API', () => {
  describe('GET /admin/reviews', () => {
    it('returns list of reviews with total', async () => {
      const reviews = [
        {
          id: 1,
          product_id: 10,
          product_title: 'Test Product',
          customer_email: 'user@example.com',
          customer_name: 'Test User',
          rating: 5,
          title: 'Great product',
          body: 'Really loved it',
          status: 'pending',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 2,
          product_id: 11,
          product_title: 'Another Product',
          customer_email: 'user2@example.com',
          customer_name: 'User Two',
          rating: 3,
          title: 'Okay',
          body: 'Average',
          status: 'approved',
          created_at: '2026-01-02T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
        },
      ];

      const db = createMockDb({ reviews, total: 2 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/reviews', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.reviews).toHaveLength(2);
      expect(json.total).toBe(2);
      expect(json.reviews[0].title).toBe('Great product');
    });

    it('returns empty array when no reviews exist', async () => {
      const db = createMockDb({ reviews: [], total: 0 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/reviews', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.reviews).toHaveLength(0);
      expect(json.total).toBe(0);
    });

    it('filters by status when specified', async () => {
      const reviews = [
        {
          id: 1,
          product_id: 10,
          product_title: 'Product',
          customer_email: 'user@example.com',
          customer_name: 'User',
          rating: 4,
          title: 'Good',
          body: 'Good product',
          status: 'pending',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ];

      const db = createMockDb({ reviews, total: 1 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/reviews?status=pending', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.reviews).toHaveLength(1);
    });

    it('supports pagination with limit and offset', async () => {
      const db = createMockDb({ reviews: [], total: 100 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/reviews?limit=10&offset=20', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
    });
  });

  describe('POST /admin/reviews/:id/approve', () => {
    it('approves a pending review', async () => {
      const review = { id: 1, status: 'pending' };
      const db = createMockDb({ review });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/reviews/1/approve', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.message).toBe('Review approved');
    });

    it('returns already approved message when review is already approved', async () => {
      const review = { id: 1, status: 'approved' };
      const db = createMockDb({ review });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/reviews/1/approve', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.message).toBe('Review already approved');
    });

    it('returns 404 for non-existent review', async () => {
      const db = createMockDb({ review: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/reviews/999/approve', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('not found');
    });

    it('returns 400 for invalid id param', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/reviews/abc/approve', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /admin/reviews/:id/reject', () => {
    it('rejects a pending review', async () => {
      const review = { id: 1, status: 'pending' };
      const db = createMockDb({ review });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/reviews/1/reject', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.message).toBe('Review rejected');
    });

    it('returns already rejected message when review is already rejected', async () => {
      const review = { id: 1, status: 'rejected' };
      const db = createMockDb({ review });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/reviews/1/reject', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.message).toBe('Review already rejected');
    });

    it('returns 404 for non-existent review', async () => {
      const db = createMockDb({ review: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/reviews/999/reject', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('not found');
    });

    it('returns 400 for invalid id param', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/reviews/abc/reject', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(res.status).toBe(400);
    });
  });
});
