import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import adminAnalytics from '../../../routes/admin/adminAnalytics';

vi.mock('../../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
}));

vi.mock('../../../middleware/rbac', () => ({
  loadRbac: async (_c: any, next: any) => next(),
  requirePermission: () => async (_c: any, next: any) => next(),
}));

const ADMIN_KEY = 'test-admin-key';

const createMockDb = (options: {
  dailySales?: any[];
  newCustomers?: number;
  returningCustomers?: number;
  throwError?: boolean;
}) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        all: vi.fn(async () => {
          if (options.throwError) {
            throw new Error('DB error');
          }
          if (sql.includes('GROUP BY')) {
            return { results: options.dailySales || [] };
          }
          return { results: [] };
        }),
        first: vi.fn(async () => {
          if (options.throwError) {
            throw new Error('DB error');
          }
          if (sql.includes('NOT EXISTS')) {
            return { count: options.newCustomers ?? 0 };
          }
          if (sql.includes('EXISTS')) {
            return { count: options.returningCustomers ?? 0 };
          }
          return null;
        }),
      })),
    })),
  };
};

const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/admin', adminAnalytics);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, { DB: db, ADMIN_API_KEY: ADMIN_KEY } as any),
  };
};

describe('Admin Analytics API', () => {
  describe('GET /admin/analytics', () => {
    it('returns analytics data for a valid date range', async () => {
      const dailySales = [
        { date: '2026-01-01', orders: 5, revenue: 50000 },
        { date: '2026-01-02', orders: 3, revenue: 30000 },
      ];

      const db = createMockDb({ dailySales, newCustomers: 4, returningCustomers: 2 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/analytics?from=2026-01-01&to=2026-01-02', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.dailySales).toHaveLength(2);
      expect(json.dailySales[0].date).toBe('2026-01-01');
      expect(json.dailySales[0].orders).toBe(5);
      expect(json.customerBreakdown.newCustomers).toBe(4);
      expect(json.customerBreakdown.returningCustomers).toBe(2);
      expect(json.summary.totalRevenue).toBe(80000);
      expect(json.summary.totalOrders).toBe(8);
      expect(json.summary.averageOrderValue).toBe(10000);
    });

    it('returns empty results when no sales data exists', async () => {
      const db = createMockDb({ dailySales: [], newCustomers: 0, returningCustomers: 0 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/analytics?from=2026-01-01&to=2026-01-31', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.dailySales).toHaveLength(0);
      expect(json.summary.totalRevenue).toBe(0);
      expect(json.summary.totalOrders).toBe(0);
      expect(json.summary.averageOrderValue).toBe(0);
    });

    it('returns 400 when from parameter is missing', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/analytics?to=2026-01-31', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('from and to query parameters are required');
    });

    it('returns 400 when to parameter is missing', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/analytics?from=2026-01-01', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('from and to query parameters are required');
    });

    it('returns 400 when both parameters are missing', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/analytics', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('from and to query parameters are required');
    });

    it('returns 400 for invalid date format', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/analytics?from=not-a-date&to=2026-01-31', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Invalid date format');
    });

    it('returns 400 when from is after to', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/analytics?from=2026-02-01&to=2026-01-01', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('from date must be before or equal to to date');
    });

    it('handles database errors gracefully', async () => {
      const db = createMockDb({ throwError: true });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/analytics?from=2026-01-01&to=2026-01-31', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(500);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Failed to fetch analytics data');
    });

    it('calculates average order value correctly with single day', async () => {
      const dailySales = [{ date: '2026-01-15', orders: 4, revenue: 100000 }];

      const db = createMockDb({ dailySales, newCustomers: 3, returningCustomers: 1 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/analytics?from=2026-01-15&to=2026-01-15', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.summary.averageOrderValue).toBe(25000);
    });
  });
});
