import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import adminNewsletter from '../../../routes/admin/adminNewsletter';

vi.mock('../../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
}));

vi.mock('../../../middleware/rbac', () => ({
  loadRbac: async (_c: any, next: any) => next(),
  requirePermission: () => async (_c: any, next: any) => next(),
}));

const ADMIN_KEY = 'test-admin-key';

const createMockDb = (options: {
  subscribers?: any[];
  total?: number;
}) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        all: vi.fn(async () => {
          if (sql.includes('FROM newsletter_subscribers')) {
            return { results: options.subscribers || [] };
          }
          return { results: [] };
        }),
        first: vi.fn(async () => {
          if (sql.includes('COUNT(*)')) {
            return { total: options.total ?? 0 };
          }
          return null;
        }),
      })),
    })),
  };
};

const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/admin/newsletter', adminNewsletter);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, { DB: db, ADMIN_API_KEY: ADMIN_KEY } as any),
  };
};

describe('Admin Newsletter API', () => {
  describe('GET /admin/newsletter/subscribers', () => {
    it('returns list of subscribers with total', async () => {
      const subscribers = [
        {
          id: 1,
          email: 'subscriber1@example.com',
          status: 'active',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 2,
          email: 'subscriber2@example.com',
          status: 'active',
          created_at: '2026-01-02T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
        },
      ];

      const db = createMockDb({ subscribers, total: 2 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/newsletter/subscribers', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.subscribers).toHaveLength(2);
      expect(json.total).toBe(2);
      expect(json.subscribers[0].email).toBe('subscriber1@example.com');
    });

    it('returns empty array when no subscribers exist', async () => {
      const db = createMockDb({ subscribers: [], total: 0 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/newsletter/subscribers', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.subscribers).toHaveLength(0);
      expect(json.total).toBe(0);
    });

    it('filters by active status', async () => {
      const subscribers = [
        {
          id: 1,
          email: 'active@example.com',
          status: 'active',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ];

      const db = createMockDb({ subscribers, total: 1 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/newsletter/subscribers?status=active', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.subscribers).toHaveLength(1);
    });

    it('filters by unsubscribed status', async () => {
      const subscribers = [
        {
          id: 3,
          email: 'unsub@example.com',
          status: 'unsubscribed',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-03T00:00:00Z',
        },
      ];

      const db = createMockDb({ subscribers, total: 1 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/newsletter/subscribers?status=unsubscribed', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.subscribers).toHaveLength(1);
    });

    it('supports pagination with limit and offset', async () => {
      const db = createMockDb({ subscribers: [], total: 100 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/newsletter/subscribers?limit=10&offset=20', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.limit).toBe(10);
      expect(json.offset).toBe(20);
    });

    it('returns default pagination values', async () => {
      const db = createMockDb({ subscribers: [], total: 0 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/newsletter/subscribers', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.limit).toBe(50);
      expect(json.offset).toBe(0);
    });

    it('returns 400 for invalid status', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/newsletter/subscribers?status=invalid', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(res.status).toBe(400);
    });
  });
});
