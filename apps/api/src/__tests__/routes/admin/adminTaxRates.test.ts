import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import adminTaxRates from '../../../routes/admin/adminTaxRates';

vi.mock('../../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
}));

const ADMIN_KEY = 'test-admin-key';

const createMockDb = (options: {
  taxRates?: any[];
  taxRate?: any | null;
  insertResult?: any | null;
  updateResult?: any | null;
  usageCount?: number;
}) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        all: vi.fn(async () => {
          if (sql.includes('FROM tax_rates')) {
            return { results: options.taxRates || [] };
          }
          return { results: [] };
        }),
        first: vi.fn(async () => {
          if (sql.includes('COUNT(*)') && sql.includes('products')) {
            return { count: options.usageCount ?? 0 };
          }
          if (sql.includes('RETURNING') && sql.includes('INSERT')) {
            return options.insertResult ?? null;
          }
          if (sql.includes('RETURNING') && sql.includes('UPDATE')) {
            return options.updateResult ?? options.taxRate ?? null;
          }
          if (sql.includes('FROM tax_rates')) {
            return options.taxRate ?? null;
          }
          return null;
        }),
        run: vi.fn(async () => ({ meta: { last_row_id: 1 } })),
      })),
      all: vi.fn(async () => {
        if (sql.includes('FROM tax_rates')) {
          return { results: options.taxRates || [] };
        }
        return { results: [] };
      }),
    })),
  };
};

const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/admin/tax-rates', adminTaxRates);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, { DB: db, ADMIN_API_KEY: ADMIN_KEY } as any),
  };
};

describe('Admin Tax Rates API', () => {
  describe('GET /admin/tax-rates', () => {
    it('returns list of tax rates', async () => {
      const taxRates = [
        {
          id: 1,
          name: '標準税率',
          rate: 0.1,
          applicable_from: '2019-10-01',
          applicable_to: null,
          is_active: 1,
          description: '標準税率10%',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 2,
          name: '軽減税率',
          rate: 0.08,
          applicable_from: '2019-10-01',
          applicable_to: null,
          is_active: 1,
          description: '軽減税率8%',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      const db = createMockDb({ taxRates });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/tax-rates', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json).toHaveLength(2);
      expect(json[0].name).toBe('標準税率');
      expect(json[1].rate).toBe(0.08);
    });

    it('returns empty array when no tax rates exist', async () => {
      const db = createMockDb({ taxRates: [] });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/tax-rates', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json).toHaveLength(0);
    });
  });

  describe('GET /admin/tax-rates/:id', () => {
    it('returns a single tax rate', async () => {
      const taxRate = {
        id: 1,
        name: '標準税率',
        rate: 0.1,
        applicable_from: '2019-10-01',
        applicable_to: null,
        is_active: 1,
        description: '標準税率10%',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const db = createMockDb({ taxRate });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/tax-rates/1', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.name).toBe('標準税率');
    });

    it('returns 404 for non-existent tax rate', async () => {
      const db = createMockDb({ taxRate: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/tax-rates/999', {
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

      const res = await fetch('/admin/tax-rates/abc', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /admin/tax-rates', () => {
    it('creates a new tax rate', async () => {
      const insertResult = {
        id: 3,
        name: '新税率',
        rate: 0.15,
        applicable_from: '2026-01-01',
        applicable_to: null,
        is_active: 1,
        description: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      const db = createMockDb({ insertResult });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/tax-rates', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: '新税率',
          rate: 0.15,
          applicable_from: '2026-01-01',
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(201);
      expect(json.id).toBe(3);
      expect(json.name).toBe('新税率');
    });

    it('returns 400 for missing required fields', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/tax-rates', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: '税率',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid rate value', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/tax-rates', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: '税率',
          rate: 1.5,
          applicable_from: '2026-01-01',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 when applicable_to is before applicable_from', async () => {
      const insertResult = { id: 1 };
      const db = createMockDb({ insertResult });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/tax-rates', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: '税率',
          rate: 0.1,
          applicable_from: '2026-06-01',
          applicable_to: '2026-01-01',
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.message).toContain('applicable_to must be after applicable_from');
    });
  });

  describe('PUT /admin/tax-rates/:id', () => {
    it('updates an existing tax rate', async () => {
      const taxRate = { id: 1, name: '標準税率', rate: 0.1 };
      const updateResult = { ...taxRate, name: '更新税率', rate: 0.12 };

      const db = createMockDb({ taxRate, updateResult });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/tax-rates/1', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: '更新税率', rate: 0.12 }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
    });

    it('returns 404 for non-existent tax rate', async () => {
      const db = createMockDb({ taxRate: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/tax-rates/999', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: '更新' }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
    });

    it('returns 400 when no fields to update', async () => {
      const taxRate = { id: 1, name: '標準税率' };
      const db = createMockDb({ taxRate });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/tax-rates/1', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.message).toContain('No fields to update');
    });
  });

  describe('DELETE /admin/tax-rates/:id', () => {
    it('soft-deletes a tax rate', async () => {
      const taxRate = { id: 1, name: '標準税率', is_active: 1 };
      const updateResult = { ...taxRate, is_active: 0 };

      const db = createMockDb({ taxRate, updateResult, usageCount: 0 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/tax-rates/1', {
        method: 'DELETE',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.message).toContain('deactivated');
    });

    it('returns 404 for non-existent tax rate', async () => {
      const db = createMockDb({ taxRate: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/tax-rates/999', {
        method: 'DELETE',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
    });

    it('returns 400 when tax rate is in use by products', async () => {
      const taxRate = { id: 1, name: '標準税率' };

      const db = createMockDb({ taxRate, usageCount: 3 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/tax-rates/1', {
        method: 'DELETE',
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.message).toContain('Cannot delete tax rate');
      expect(json.message).toContain('3 product(s)');
    });
  });
});
