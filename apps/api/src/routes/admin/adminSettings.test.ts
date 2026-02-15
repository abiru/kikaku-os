import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import adminSettings from './adminSettings';

describe('Admin Settings API', () => {
  let app: Hono;
  let mockEnv: Record<string, unknown>;

  beforeEach(() => {
    app = new Hono();
    app.route('/admin/settings', adminSettings);

    const settingsData: Record<string, Record<string, unknown>> = {
      shipping_fee_amount: {
        id: 1,
        key: 'shipping_fee_amount',
        value: '500',
        category: 'shipping',
        data_type: 'integer',
        description: '基本送料',
        validation_rules: null,
        display_order: 1,
        is_active: 1,
        created_at: '2024-01-01',
        updated_at: '2024-01-01'
      },
      company_name: {
        id: 2,
        key: 'company_name',
        value: 'Test Company',
        category: 'company',
        data_type: 'string',
        description: '会社名',
        validation_rules: null,
        display_order: 10,
        is_active: 1,
        created_at: '2024-01-01',
        updated_at: '2024-01-01'
      }
    };

    mockEnv = {
      DB: {
        prepare: (query: string) => {
          const preparedQuery = {
            bind: (...args: unknown[]) => ({
              first: async () => {
                if (query.includes('SELECT') && query.includes('WHERE key')) {
                  const key = args[0];
                  return settingsData[key] || null;
                }
                if (query.includes('UPDATE app_settings') && query.includes('RETURNING')) {
                  const value = args[0];
                  const key = args[1];
                  if (settingsData[key]) {
                    return {
                      ...settingsData[key],
                      value,
                      updated_at: '2024-01-02'
                    };
                  }
                  return null;
                }
                return null;
              },
              run: async () => ({ success: true })
            }),
            all: async () => {
              if (query.includes('FROM app_settings') && query.includes('WHERE is_active')) {
                return {
                  results: Object.values(settingsData)
                };
              }
              return { results: [] };
            }
          };
          return preparedQuery;
        }
      }
    };
  });

  describe('GET /admin/settings', () => {
    it('returns all settings grouped by category', async () => {
      const res = await app.request('/admin/settings', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-key' }
      }, mockEnv);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data).toHaveProperty('settings');
      expect(data).toHaveProperty('grouped');
      expect(data.grouped).toHaveProperty('shipping');
      expect(data.grouped).toHaveProperty('company');
    });
  });

  describe('GET /admin/settings/:key', () => {
    it('returns single setting by key', async () => {
      const res = await app.request('/admin/settings/shipping_fee_amount', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-key' }
      }, mockEnv);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.key).toBe('shipping_fee_amount');
    });

    it('returns 404 for non-existent setting', async () => {
      const res = await app.request('/admin/settings/nonexistent_key', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-key' }
      }, mockEnv);

      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid key format', async () => {
      const res = await app.request('/admin/settings/INVALID-KEY!', {
        method: 'GET',
        headers: { 'x-admin-key': 'test-key' }
      }, mockEnv);

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /admin/settings/:key', () => {
    it('updates setting value', async () => {
      const res = await app.request('/admin/settings/shipping_fee_amount', {
        method: 'PUT',
        headers: {
          'x-admin-key': 'test-key',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ value: '600' })
      }, mockEnv);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.value).toBe('600');
    });

    it('validates integer data type', async () => {
      const res = await app.request('/admin/settings/shipping_fee_amount', {
        method: 'PUT',
        headers: {
          'x-admin-key': 'test-key',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ value: 'not-a-number' })
      }, mockEnv);

      expect(res.status).toBe(400);
    });
  });

  describe('POST /admin/settings/bulk', () => {
    it('updates multiple settings', async () => {
      const res = await app.request('/admin/settings/bulk', {
        method: 'POST',
        headers: {
          'x-admin-key': 'test-key',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          settings: [
            { key: 'shipping_fee_amount', value: '600' },
            { key: 'company_name', value: 'Updated Company' }
          ]
        })
      }, mockEnv);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.results).toHaveLength(2);
    });

    it('validates key format in bulk update', async () => {
      const res = await app.request('/admin/settings/bulk', {
        method: 'POST',
        headers: {
          'x-admin-key': 'test-key',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          settings: [
            { key: 'INVALID-KEY!', value: '600' }
          ]
        })
      }, mockEnv);

      expect(res.status).toBe(400);
    });
  });
});
