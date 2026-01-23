import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import adminSettings from './adminSettings';

describe('Admin Settings API', () => {
  let app: Hono;
  let mockEnv: any;

  beforeEach(() => {
    app = new Hono();
    app.route('/admin/settings', adminSettings);

    mockEnv = {
      DB: {
        prepare: (query: string) => ({
          bind: (...args: any[]) => ({
            first: async () => {
              if (query.includes('WHERE key')) {
                const key = args[0];
                if (key === 'shipping_fee_amount') {
                  return {
                    id: 1,
                    key: 'shipping_fee_amount',
                    value: '500',
                    category: 'shipping',
                    data_type: 'integer',
                    description: '基本送料',
                    validation_rules: null,
                    is_active: 1
                  };
                }
              }
              if (query.includes('UPDATE app_settings')) {
                return {
                  id: 1,
                  key: 'shipping_fee_amount',
                  value: '600',
                  category: 'shipping',
                  data_type: 'integer',
                  description: '基本送料',
                  is_active: 1
                };
              }
              return null;
            },
            all: async () => {
              if (query.includes('app_settings')) {
                return {
                  results: [
                    {
                      id: 1,
                      key: 'shipping_fee_amount',
                      value: '500',
                      category: 'shipping',
                      data_type: 'integer',
                      description: '基本送料',
                      is_active: 1
                    },
                    {
                      id: 2,
                      key: 'company_name',
                      value: 'Test Company',
                      category: 'company',
                      data_type: 'string',
                      description: '会社名',
                      is_active: 1
                    }
                  ]
                };
              }
              return { results: [] };
            },
            run: async () => ({ success: true })
          })
        })
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
      expect(data.data).toHaveProperty('settings');
      expect(data.data).toHaveProperty('grouped');
      expect(data.data.grouped).toHaveProperty('shipping');
      expect(data.data.grouped).toHaveProperty('company');
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
      expect(data.data.key).toBe('shipping_fee_amount');
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
      expect(data.data.value).toBe('600');
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
      expect(data.data.results).toHaveLength(2);
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
