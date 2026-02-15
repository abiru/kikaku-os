import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import adminAdsDrafts from '../../../routes/admin/adminAdsDrafts';

// Mock dependencies
vi.mock('../../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
}));

vi.mock('../../../middleware/rbac', () => ({
  loadRbac: async (_c: any, next: any) => next(),
  requirePermission: () => async (_c: any, next: any) => next(),
}));

vi.mock('../../../services/adValidation', () => ({
  validateAdCopy: vi.fn().mockReturnValue({ valid: true, errors: [] }),
}));

import { validateAdCopy } from '../../../services/adValidation';

type MockDbOptions = {
  drafts?: any[];
  draft?: any | null;
  countResult?: { count: number };
  insertLastRowId?: number;
  existingDraft?: any | null;
};

const createMockDb = (options: MockDbOptions = {}) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        all: vi.fn(async () => ({
          results: options.drafts || [],
        })),
        first: vi.fn(async () => {
          if (sql.includes('COUNT(*)')) {
            return options.countResult || { count: options.drafts?.length || 0 };
          }
          if (sql.includes('INSERT INTO ad_drafts') && sql.includes('RETURNING')) {
            return options.draft || null;
          }
          if (sql.includes('SELECT id FROM ad_drafts') && sql.includes('WHERE id')) {
            return options.existingDraft || null;
          }
          if (sql.includes('SELECT id, campaign_name FROM ad_drafts')) {
            return options.existingDraft || null;
          }
          if (sql.includes('FROM ad_drafts')) {
            return options.draft || null;
          }
          return null;
        }),
        run: vi.fn(async () => ({
          meta: {
            last_row_id: options.insertLastRowId || 1,
            changes: 1,
          },
        })),
      })),
    })),
  };
};

const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/admin/ads/drafts', adminAdsDrafts);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, { DB: db } as any),
  };
};

describe('Admin Ads Drafts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (validateAdCopy as any).mockReturnValue({ valid: true, errors: [] });
  });

  describe('GET /admin/ads/drafts', () => {
    it('returns paginated draft list', async () => {
      const drafts = [
        {
          id: 1,
          campaign_name: 'Campaign A',
          ad_type: 'search',
          status: 'draft',
          language: 'ja',
          product_name: 'Product A',
          final_url: 'https://example.com',
          daily_budget: 1000,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
        {
          id: 2,
          campaign_name: 'Campaign B',
          ad_type: 'display',
          status: 'ready',
          language: 'en',
          product_name: 'Product B',
          final_url: 'https://example.com/b',
          daily_budget: 2000,
          created_at: '2026-01-02',
          updated_at: '2026-01-02',
        },
      ];

      const db = createMockDb({ drafts, countResult: { count: 2 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.drafts).toHaveLength(2);
      expect(json.meta.page).toBe(1);
      expect(json.meta.totalCount).toBe(2);
    });

    it('supports search query parameter', async () => {
      const drafts = [
        {
          id: 1,
          campaign_name: 'Matching Campaign',
          ad_type: 'search',
          status: 'draft',
        },
      ];

      const db = createMockDb({ drafts, countResult: { count: 1 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts?q=Matching');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.drafts).toHaveLength(1);
    });

    it('supports status filter', async () => {
      const drafts = [
        { id: 1, campaign_name: 'Draft Campaign', status: 'draft' },
      ];

      const db = createMockDb({ drafts, countResult: { count: 1 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts?status=draft');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
    });

    it('supports pagination parameters', async () => {
      const db = createMockDb({ drafts: [], countResult: { count: 50 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts?page=2&perPage=10');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.meta.page).toBe(2);
      expect(json.meta.perPage).toBe(10);
      expect(json.meta.totalPages).toBe(5);
    });

    it('returns empty list when no drafts exist', async () => {
      const db = createMockDb({ drafts: [], countResult: { count: 0 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.drafts).toHaveLength(0);
      expect(json.meta.totalCount).toBe(0);
    });
  });

  describe('POST /admin/ads/drafts', () => {
    it('creates ad draft successfully', async () => {
      const draft = {
        id: 1,
        campaign_name: 'Test Campaign',
        ad_type: 'search',
        status: 'draft',
        language: 'ja',
        product_id: null,
        product_name: 'Test Product',
        product_description: 'Test Description',
        target_audience: 'Test Audience',
        headlines: JSON.stringify(['H1', 'H2']),
        descriptions: JSON.stringify(['D1', 'D2']),
        keywords: JSON.stringify(['k1', 'k2']),
        final_url: 'https://example.com',
        daily_budget: 1000,
        tone: 'professional',
        last_prompt: 'Test prompt',
        metadata: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      };

      const db = createMockDb({ draft, insertLastRowId: 1 });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_name: 'Test Campaign',
          ad_type: 'search',
          status: 'draft',
          language: 'ja',
          product_name: 'Test Product',
          headlines: ['H1', 'H2'],
          descriptions: ['D1', 'D2'],
          final_url: 'https://example.com',
        }),
      });

      const json = (await res.json()) as any;

      expect(res.status).toBe(201);
      expect(json.id).toBe(1);
      expect(json.campaign_name).toBe('Test Campaign');
      expect(json.headlines).toEqual(['H1', 'H2']);
      expect(json.descriptions).toEqual(['D1', 'D2']);
    });

    it('validates required fields', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Missing required fields
          campaign_name: 'Test',
        }),
      });

      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.ok).toBe(false);
    });

    it('validates headlines count limits', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      // Test minimum headlines
      const resMin = await fetch('/admin/ads/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_name: 'Test',
          headlines: [], // Empty
          descriptions: ['D1'],
          final_url: 'https://example.com',
        }),
      });

      expect(resMin.status).toBe(400);

      // Test maximum headlines (over 15)
      const tooManyHeadlines = Array.from({ length: 16 }, (_, i) => `H${i}`);
      const resMax = await fetch('/admin/ads/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_name: 'Test',
          headlines: tooManyHeadlines,
          descriptions: ['D1'],
          final_url: 'https://example.com',
        }),
      });

      expect(resMax.status).toBe(400);
    });

    it('validates descriptions count limits', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      // Test minimum descriptions
      const resMin = await fetch('/admin/ads/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_name: 'Test',
          headlines: ['H1'],
          descriptions: [], // Empty
          final_url: 'https://example.com',
        }),
      });

      expect(resMin.status).toBe(400);

      // Test maximum descriptions (over 4)
      const tooManyDescriptions = Array.from({ length: 5 }, (_, i) => `D${i}`);
      const resMax = await fetch('/admin/ads/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_name: 'Test',
          headlines: ['H1'],
          descriptions: tooManyDescriptions,
          final_url: 'https://example.com',
        }),
      });

      expect(resMax.status).toBe(400);
    });

    it('returns 400 when ad copy validation fails', async () => {
      (validateAdCopy as any).mockReturnValueOnce({
        valid: false,
        errors: ['Headlines too long', 'Invalid URL'],
      });

      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_name: 'Test',
          headlines: ['H1'],
          descriptions: ['D1'],
          final_url: 'https://example.com',
        }),
      });

      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Validation failed');
    });
  });

  describe('GET /admin/ads/drafts/:id', () => {
    it('returns draft by id', async () => {
      const draft = {
        id: 1,
        campaign_name: 'Test Campaign',
        ad_type: 'search',
        status: 'draft',
        language: 'ja',
        product_id: null,
        product_name: 'Test Product',
        product_description: 'Test Desc',
        target_audience: 'Test Audience',
        headlines: JSON.stringify(['H1', 'H2']),
        descriptions: JSON.stringify(['D1']),
        keywords: JSON.stringify(['k1']),
        final_url: 'https://example.com',
        daily_budget: 1000,
        tone: 'professional',
        last_prompt: null,
        metadata: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      };

      const db = createMockDb({ draft });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts/1');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.draft.id).toBe(1);
      expect(json.draft.headlines).toEqual(['H1', 'H2']);
      expect(json.draft.descriptions).toEqual(['D1']);
    });

    it('returns 404 when draft not found', async () => {
      const db = createMockDb({ draft: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts/999');
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('not found');
    });

    it('validates id parameter', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts/invalid-id');
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /admin/ads/drafts/:id', () => {
    it('updates draft successfully', async () => {
      const existing = { id: 1 };
      const updated = {
        id: 1,
        campaign_name: 'Updated Campaign',
        ad_type: 'search',
        status: 'ready',
        language: 'ja',
        product_id: null,
        product_name: 'Updated Product',
        product_description: null,
        target_audience: null,
        headlines: JSON.stringify(['H1-updated', 'H2-updated']),
        descriptions: JSON.stringify(['D1-updated']),
        keywords: null,
        final_url: 'https://example.com/updated',
        daily_budget: 2000,
        tone: null,
        last_prompt: null,
        metadata: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-02',
      };

      const db = createMockDb({ existingDraft: existing, draft: updated });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_name: 'Updated Campaign',
          status: 'ready',
          daily_budget: 2000,
        }),
      });

      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.draft.campaign_name).toBe('Updated Campaign');
    });

    it('returns 404 when draft not found', async () => {
      const db = createMockDb({ existingDraft: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts/999', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_name: 'Updated',
        }),
      });

      expect(res.status).toBe(404);
      const json = (await res.json()) as any;
      expect(json.ok).toBe(false);
    });

    it('validates ad copy when headlines/descriptions are updated', async () => {
      (validateAdCopy as any).mockReturnValueOnce({
        valid: false,
        errors: ['Invalid URL domain', 'Too many exclamation marks'],
      });

      const existing = { id: 1 };
      const current = {
        headlines: JSON.stringify(['H1']),
        descriptions: JSON.stringify(['D1']),
        final_url: 'https://example.com',
        language: 'ja',
      };

      const db = createMockDb({ existingDraft: existing, draft: current });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headlines: ['Valid length!!'],
        }),
      });

      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Validation failed');
    });
  });

  describe('DELETE /admin/ads/drafts/:id', () => {
    it('deletes draft successfully', async () => {
      const existing = { id: 1, campaign_name: 'Test Campaign' };
      const db = createMockDb({ existingDraft: existing });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts/1', {
        method: 'DELETE',
      });

      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.deleted).toBe(true);
    });

    it('returns 404 when draft not found', async () => {
      const db = createMockDb({ existingDraft: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts/999', {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
      const json = (await res.json()) as any;
      expect(json.ok).toBe(false);
    });
  });
});
