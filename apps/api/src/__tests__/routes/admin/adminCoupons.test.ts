import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import adminCoupons from '../../../routes/admin/adminCoupons';

vi.mock('../../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
}));

const ADMIN_KEY = 'test-admin-key';

const sampleCoupon = {
  id: 1,
  code: 'SAVE10',
  type: 'percentage',
  value: 10,
  currency: 'JPY',
  min_order_amount: 1000,
  max_uses: 100,
  uses_per_customer: 1,
  current_uses: 0,
  status: 'active',
  starts_at: null,
  expires_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const createMockDb = (options: {
  coupons?: any[];
  coupon?: any | null;
  countResult?: { count: number };
  existingByCode?: any | null;
  duplicateByCode?: any | null;
  usageStats?: any | null;
  insertMeta?: { last_row_id: number };
}) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        all: vi.fn(async () => {
          if (sql.includes('FROM coupons') && !sql.includes('COUNT')) {
            return { results: options.coupons || [] };
          }
          return { results: [] };
        }),
        first: vi.fn(async () => {
          if (sql.includes('COUNT(*)') && sql.includes('coupons')) {
            return options.countResult || { count: 0 };
          }
          if (sql.includes('total_usages') || sql.includes('coupon_usages')) {
            return options.usageStats || { total_usages: 0, total_discount: 0 };
          }
          if (sql.includes('SELECT id FROM coupons WHERE code') && sql.includes('AND id !=')) {
            return options.duplicateByCode || null;
          }
          if (sql.includes('SELECT id FROM coupons WHERE code')) {
            return options.existingByCode || null;
          }
          if (sql.includes('FROM coupons')) {
            return options.coupon ?? null;
          }
          return null;
        }),
        run: vi.fn(async () => ({
          meta: options.insertMeta || { last_row_id: 1 },
        })),
      })),
    })),
  };
};

const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/admin', adminCoupons);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, { DB: db, ADMIN_API_KEY: ADMIN_KEY } as any),
  };
};

describe('Admin Coupons API', () => {
  describe('GET /admin/coupons', () => {
    it('returns list of coupons with pagination', async () => {
      const db = createMockDb({
        coupons: [sampleCoupon],
        countResult: { count: 1 },
      });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/coupons', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.coupons).toHaveLength(1);
      expect(json.coupons[0].code).toBe('SAVE10');
      expect(json.meta).toEqual({
        page: 1,
        perPage: 20,
        totalCount: 1,
        totalPages: 1,
      });
    });

    it('returns empty list when no coupons exist', async () => {
      const db = createMockDb({ coupons: [], countResult: { count: 0 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/coupons', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.coupons).toHaveLength(0);
    });
  });

  describe('GET /admin/coupons/:id', () => {
    it('returns a single coupon with usage stats', async () => {
      const db = createMockDb({
        coupon: sampleCoupon,
        usageStats: { total_usages: 5, total_discount: 500 },
      });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/coupons/1', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.coupon.code).toBe('SAVE10');
      expect(json.stats.totalUsages).toBe(5);
      expect(json.stats.totalDiscount).toBe(500);
    });

    it('returns 404 for non-existent coupon', async () => {
      const db = createMockDb({ coupon: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/coupons/999', {
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

      const res = await fetch('/admin/coupons/abc', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /admin/coupons', () => {
    it('creates a new coupon', async () => {
      const newCoupon = { ...sampleCoupon, id: 2, code: 'NEWCODE' };
      const db = createMockDb({
        existingByCode: null,
        coupon: newCoupon,
        insertMeta: { last_row_id: 2 },
      });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/coupons', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: 'NEWCODE',
          type: 'percentage',
          value: 10,
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.coupon).toBeDefined();
    });

    it('returns 400 for duplicate code', async () => {
      const db = createMockDb({
        existingByCode: { id: 1 },
      });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/coupons', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: 'SAVE10',
          type: 'percentage',
          value: 10,
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.message).toContain('already exists');
    });

    it('returns 400 for missing required fields', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/coupons', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: 'TEST',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid coupon type', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/coupons', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: 'TEST',
          type: 'invalid',
          value: 10,
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /admin/coupons/:id', () => {
    it('deletes an unused coupon', async () => {
      const db = createMockDb({
        coupon: { id: 1, code: 'SAVE10', current_uses: 0 },
      });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/coupons/1', {
        method: 'DELETE',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.deleted).toBe(true);
    });

    it('returns 400 when coupon has been used', async () => {
      const db = createMockDb({
        coupon: { id: 1, code: 'SAVE10', current_uses: 5 },
      });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/coupons/1', {
        method: 'DELETE',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.message).toContain('Cannot delete');
    });

    it('returns 404 for non-existent coupon', async () => {
      const db = createMockDb({ coupon: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/coupons/999', {
        method: 'DELETE',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
    });
  });

  describe('POST /admin/coupons/:id/toggle', () => {
    it('toggles coupon from active to inactive', async () => {
      const updatedCoupon = { ...sampleCoupon, status: 'inactive' };
      const db = createMockDb({
        coupon: { ...sampleCoupon, status: 'active' },
      });
      // Override to return different results on subsequent calls
      let callCount = 0;
      (db as any).prepare = vi.fn((sql: string) => ({
        bind: vi.fn((..._args: unknown[]) => ({
          all: vi.fn(async () => ({ results: [] as any[] })),
          first: vi.fn(async () => {
            if (sql.includes('SELECT id, code, status')) {
              return { id: 1, code: 'SAVE10', status: 'active' };
            }
            if (sql.includes('FROM coupons WHERE id')) {
              return updatedCoupon;
            }
            return null;
          }),
          run: vi.fn(async () => ({ meta: {} })),
        })),
      }));

      const { fetch } = createApp(db);

      const res = await fetch('/admin/coupons/1/toggle', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
    });

    it('returns 404 for non-existent coupon', async () => {
      const db = createMockDb({ coupon: null });
      (db as any).prepare = vi.fn((sql: string) => ({
        bind: vi.fn((..._args: unknown[]) => ({
          all: vi.fn(async () => ({ results: [] as any[] })),
          first: vi.fn(async () => null),
          run: vi.fn(async () => ({ meta: {} })),
        })),
      }));
      const { fetch } = createApp(db);

      const res = await fetch('/admin/coupons/999/toggle', {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
    });
  });
});
