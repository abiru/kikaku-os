import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import adminSettings from '../../../routes/admin/adminSettings';

vi.mock('../../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
}));

vi.mock('../../../middleware/rbac', () => ({
  loadRbac: async (_c: any, next: any) => next(),
  requirePermission: () => async (_c: any, next: any) => next(),
}));

const ADMIN_KEY = 'test-admin-key';

const createMockDb = (options: {
  settings?: any[];
  setting?: any | null;
  updateResult?: any | null;
  bulkSettings?: Record<string, any | null>;
}) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => ({
        all: vi.fn(async () => {
          if (sql.includes('FROM app_settings')) {
            return { results: options.settings || [] };
          }
          return { results: [] };
        }),
        first: vi.fn(async () => {
          if (sql.includes('RETURNING') && sql.includes('UPDATE')) {
            return options.updateResult ?? options.setting ?? null;
          }
          if (sql.includes('FROM app_settings') && sql.includes('WHERE key')) {
            // For bulk operations, check the key argument
            if (options.bulkSettings) {
              const key = args[0] as string;
              if (key in options.bulkSettings) {
                return options.bulkSettings[key];
              }
            }
            return options.setting ?? null;
          }
          return null;
        }),
        run: vi.fn(async () => ({ meta: { last_row_id: 1 } })),
      })),
      all: vi.fn(async () => {
        if (sql.includes('FROM app_settings')) {
          return { results: options.settings || [] };
        }
        return { results: [] };
      }),
    })),
  };
};

const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/admin/settings', adminSettings);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, { DB: db, ADMIN_API_KEY: ADMIN_KEY } as any),
  };
};

describe('Admin Settings API', () => {
  describe('GET /admin/settings', () => {
    it('returns all active settings grouped by category', async () => {
      const settings = [
        {
          id: 1,
          key: 'site_name',
          value: 'Led Kikaku',
          category: 'general',
          data_type: 'string',
          description: 'Site name',
          display_order: 1,
          is_active: 1,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 2,
          key: 'shipping_fee',
          value: '500',
          category: 'shipping',
          data_type: 'integer',
          description: 'Shipping fee',
          display_order: 1,
          is_active: 1,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ];

      const db = createMockDb({ settings });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/settings', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.settings).toHaveLength(2);
      expect(json.grouped).toBeDefined();
      expect(json.grouped.general).toHaveLength(1);
      expect(json.grouped.shipping).toHaveLength(1);
    });

    it('returns empty settings when none exist', async () => {
      const db = createMockDb({ settings: [] });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/settings', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.settings).toHaveLength(0);
    });
  });

  describe('GET /admin/settings/:key', () => {
    it('returns a single setting by key', async () => {
      const setting = {
        id: 1,
        key: 'site_name',
        value: 'Led Kikaku',
        category: 'general',
        data_type: 'string',
        description: 'Site name',
        validation_rules: null,
        display_order: 1,
        is_active: 1,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      const db = createMockDb({ setting });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/settings/site_name', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.key).toBe('site_name');
      expect(json.value).toBe('Led Kikaku');
    });

    it('returns 404 for non-existent setting', async () => {
      const db = createMockDb({ setting: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/settings/nonexistent_key', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('not found');
    });

    it('returns 400 for invalid key format', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/settings/INVALID-KEY!', {
        headers: { 'x-admin-key': ADMIN_KEY },
      });

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /admin/settings/:key', () => {
    it('updates a string setting', async () => {
      const setting = {
        id: 1,
        key: 'site_name',
        value: 'Led Kikaku',
        data_type: 'string',
        validation_rules: null,
      };
      const updateResult = {
        id: 1,
        key: 'site_name',
        value: 'New Name',
        category: 'general',
        data_type: 'string',
        description: 'Site name',
        display_order: 1,
        is_active: 1,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
      };

      const db = createMockDb({ setting, updateResult });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/settings/site_name', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: 'New Name' }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.value).toBe('New Name');
    });

    it('returns 404 for non-existent setting', async () => {
      const db = createMockDb({ setting: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/settings/nonexistent_key', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: 'some value' }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('not found');
    });

    it('returns 400 for invalid integer value', async () => {
      const setting = {
        id: 2,
        key: 'shipping_fee',
        value: '500',
        data_type: 'integer',
        validation_rules: null,
      };

      const db = createMockDb({ setting });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/settings/shipping_fee', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: 'not-a-number' }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('integer');
    });

    it('returns 400 for invalid boolean value', async () => {
      const setting = {
        id: 3,
        key: 'enable_feature',
        value: 'true',
        data_type: 'boolean',
        validation_rules: null,
      };

      const db = createMockDb({ setting });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/settings/enable_feature', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: 'maybe' }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('boolean');
    });

    it('returns 400 for invalid email value', async () => {
      const setting = {
        id: 4,
        key: 'contact_email',
        value: 'admin@example.com',
        data_type: 'email',
        validation_rules: null,
      };

      const db = createMockDb({ setting });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/settings/contact_email', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: 'not-an-email' }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('email');
    });

    it('returns 400 for invalid url value', async () => {
      const setting = {
        id: 5,
        key: 'site_url',
        value: 'https://example.com',
        data_type: 'url',
        validation_rules: null,
      };

      const db = createMockDb({ setting });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/settings/site_url', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: 'not-a-url' }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('URL');
    });

    it('validates integer min/max from validation_rules', async () => {
      const setting = {
        id: 2,
        key: 'max_items',
        value: '10',
        data_type: 'integer',
        validation_rules: JSON.stringify({ min: 1, max: 100 }),
      };

      const db = createMockDb({ setting });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/settings/max_items', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: '200' }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('at most 100');
    });

    it('validates string maxLength from validation_rules', async () => {
      const setting = {
        id: 1,
        key: 'short_text',
        value: 'hi',
        data_type: 'string',
        validation_rules: JSON.stringify({ maxLength: 5 }),
      };

      const db = createMockDb({ setting });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/settings/short_text', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: 'this is way too long' }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('5 characters');
    });

    it('returns 400 for invalid key format', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/settings/INVALID-KEY!', {
        method: 'PUT',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: 'test' }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /admin/settings/bulk', () => {
    it('updates multiple settings at once', async () => {
      const bulkSettings: Record<string, any> = {
        site_name: { id: 1, data_type: 'string', validation_rules: null },
        shipping_fee: { id: 2, data_type: 'integer', validation_rules: null },
      };

      const db = createMockDb({ bulkSettings });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/settings/bulk', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          settings: [
            { key: 'site_name', value: 'New Name' },
            { key: 'shipping_fee', value: '800' },
          ],
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.results).toHaveLength(2);
      expect(json.errors).toHaveLength(0);
    });

    it('reports errors for non-existent settings in bulk', async () => {
      const bulkSettings: Record<string, any> = {
        site_name: { id: 1, data_type: 'string', validation_rules: null },
      };

      const db = createMockDb({ bulkSettings });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/settings/bulk', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          settings: [
            { key: 'site_name', value: 'Updated' },
            { key: 'nonexistent_key', value: 'test' },
          ],
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.results).toHaveLength(1);
      expect(json.errors).toHaveLength(1);
      expect(json.errors[0].key).toBe('nonexistent_key');
      expect(json.errors[0].error).toContain('not found');
    });

    it('reports validation errors in bulk update', async () => {
      const bulkSettings: Record<string, any> = {
        shipping_fee: { id: 2, data_type: 'integer', validation_rules: null },
      };

      const db = createMockDb({ bulkSettings });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/settings/bulk', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          settings: [{ key: 'shipping_fee', value: 'not-a-number' }],
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.results).toHaveLength(0);
      expect(json.errors).toHaveLength(1);
      expect(json.errors[0].key).toBe('shipping_fee');
    });

    it('returns 400 when settings array is empty', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/settings/bulk', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ settings: [] }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 when settings field is missing', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/settings/bulk', {
        method: 'POST',
        headers: {
          'x-admin-key': ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });
});
