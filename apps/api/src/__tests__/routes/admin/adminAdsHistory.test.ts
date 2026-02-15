import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import adminAdsHistory from '../../../routes/admin/adminAdsHistory';

// Mock dependencies
vi.mock('../../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
}));

vi.mock('../../../middleware/rbac', () => ({
  loadRbac: async (_c: any, next: any) => next(),
  requirePermission: () => async (_c: any, next: any) => next(),
}));

type MockDbOptions = {
  draft?: any | null;
  history?: any[];
  historyRecord?: any | null;
  updatedDraft?: any | null;
};

const createMockDb = (options: MockDbOptions = {}) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        all: vi.fn(async () => ({
          results: options.history || [],
        })),
        first: vi.fn(async () => {
          if (sql.includes('SELECT id FROM ad_drafts')) {
            return options.draft || null;
          }
          if (sql.includes('FROM ad_generation_history') && sql.includes('WHERE id')) {
            return options.historyRecord || null;
          }
          if (sql.includes('FROM ad_drafts') && sql.includes('WHERE id')) {
            return options.updatedDraft || null;
          }
          return null;
        }),
        run: vi.fn(async () => ({
          meta: { changes: 1 },
        })),
      })),
    })),
  };
};

const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/admin/ads/drafts', adminAdsHistory);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, { DB: db } as any),
  };
};

describe('Admin Ads History', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /admin/ads/drafts/:id/history', () => {
    it('returns generation history for a draft', async () => {
      const history = [
        {
          id: 1,
          draft_id: 1,
          prompt: 'Generate ad copy for Product A',
          generated_content: JSON.stringify({
            candidates: [
              {
                headlines: ['H1', 'H2'],
                descriptions: ['D1'],
                suggestedKeywords: ['k1'],
              },
            ],
          }),
          selected: 1,
          created_at: '2026-01-01 10:00:00',
        },
        {
          id: 2,
          draft_id: 1,
          prompt: 'Generate ad copy v2',
          generated_content: JSON.stringify({
            candidates: [
              {
                headlines: ['H3', 'H4'],
                descriptions: ['D2'],
                suggestedKeywords: ['k2'],
              },
            ],
          }),
          selected: 0,
          created_at: '2026-01-02 10:00:00',
        },
      ];

      const db = createMockDb({ draft: { id: 1 }, history });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts/1/history');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.history).toHaveLength(2);
      expect(json.history[0].id).toBe(1);
      expect(json.history[0].selected).toBe(1);
      expect(json.history[1].selected).toBe(0);
    });

    it('returns empty history when no generations exist', async () => {
      const db = createMockDb({ draft: { id: 1 }, history: [] });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts/1/history');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.history).toHaveLength(0);
    });

    it('returns 404 when draft not found', async () => {
      const db = createMockDb({ draft: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts/999/history');
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('not found');
    });

    it('validates draft id parameter', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts/invalid-id/history');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /admin/ads/drafts/:id/select-history', () => {
    it('adopts previous generation successfully', async () => {
      const historyRecord = {
        id: 10,
        draft_id: 1,
        prompt: 'Test prompt',
        generated_content: JSON.stringify({
          candidates: [
            {
              headlines: ['H1', 'H2', 'H3'],
              descriptions: ['D1', 'D2'],
              suggestedKeywords: ['k1', 'k2'],
            },
          ],
        }),
      };

      const updatedDraft = {
        id: 1,
        campaign_name: 'Test Campaign',
        ad_type: 'search',
        status: 'draft',
        language: 'ja',
        product_id: null,
        product_name: 'Test Product',
        product_description: null,
        target_audience: null,
        headlines: JSON.stringify(['H1', 'H2', 'H3']),
        descriptions: JSON.stringify(['D1', 'D2']),
        keywords: JSON.stringify(['k1', 'k2']),
        final_url: 'https://example.com',
        daily_budget: null,
        tone: null,
        last_prompt: 'Test prompt',
        metadata: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-02',
      };

      const db = createMockDb({ historyRecord, updatedDraft });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts/1/select-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          historyId: 10,
        }),
      });

      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.draft.id).toBe(1);
      expect(json.draft.headlines).toEqual(['H1', 'H2', 'H3']);
      expect(json.draft.descriptions).toEqual(['D1', 'D2']);
      expect(json.draft.keywords).toEqual(['k1', 'k2']);
      expect(json.draft.last_prompt).toBe('Test prompt');
    });

    it('returns 404 when history record not found', async () => {
      const db = createMockDb({ historyRecord: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts/1/select-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          historyId: 999,
        }),
      });

      expect(res.status).toBe(404);
      const json = (await res.json()) as any;
      expect(json.ok).toBe(false);
      expect(json.message).toContain('not found');
    });

    it('returns 404 when history does not belong to draft', async () => {
      // Mock should return null because the SQL query has:
      // WHERE id = ? AND draft_id = ?
      // If draft_id doesn't match, the query returns null
      const db = createMockDb({ historyRecord: null });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts/1/select-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          historyId: 10,
        }),
      });

      expect(res.status).toBe(404);
      const json = (await res.json()) as any;
      expect(json.ok).toBe(false);
      expect(json.message).toContain('does not belong');
    });

    it('returns 400 when history content is invalid', async () => {
      const historyRecord = {
        id: 10,
        draft_id: 1,
        prompt: 'Test',
        generated_content: JSON.stringify({ candidates: [] }), // Empty candidates
      };

      const db = createMockDb({ historyRecord });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts/1/select-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          historyId: 10,
        }),
      });

      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Invalid history content');
    });

    it('validates historyId parameter', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts/1/select-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          historyId: -1, // Invalid
        }),
      });

      expect(res.status).toBe(400);
    });

    it('parses JSON fields in returned draft', async () => {
      const historyRecord = {
        id: 10,
        draft_id: 1,
        prompt: 'Test',
        generated_content: JSON.stringify({
          candidates: [
            {
              headlines: ['H1'],
              descriptions: ['D1'],
              suggestedKeywords: ['k1'],
            },
          ],
        }),
      };

      const updatedDraft = {
        id: 1,
        campaign_name: 'Test',
        ad_type: 'search',
        status: 'draft',
        language: 'ja',
        product_id: null,
        product_name: null,
        product_description: null,
        target_audience: null,
        headlines: JSON.stringify(['H1']),
        descriptions: JSON.stringify(['D1']),
        keywords: JSON.stringify(['k1']),
        final_url: 'https://example.com',
        daily_budget: null,
        tone: null,
        last_prompt: 'Test',
        metadata: JSON.stringify({ test: 'data' }),
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      };

      const db = createMockDb({ historyRecord, updatedDraft });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts/1/select-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          historyId: 10,
        }),
      });

      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.draft.headlines).toEqual(['H1']); // Parsed from JSON
      expect(json.draft.descriptions).toEqual(['D1']); // Parsed from JSON
      expect(json.draft.keywords).toEqual(['k1']); // Parsed from JSON
      expect(json.draft.metadata).toEqual({ test: 'data' }); // Parsed from JSON
    });

    it('handles null keywords and metadata gracefully', async () => {
      const historyRecord = {
        id: 10,
        draft_id: 1,
        prompt: 'Test',
        generated_content: JSON.stringify({
          candidates: [
            {
              headlines: ['H1'],
              descriptions: ['D1'],
              suggestedKeywords: [],
            },
          ],
        }),
      };

      const updatedDraft = {
        id: 1,
        campaign_name: 'Test',
        ad_type: 'search',
        status: 'draft',
        language: 'ja',
        product_id: null,
        product_name: null,
        product_description: null,
        target_audience: null,
        headlines: JSON.stringify(['H1']),
        descriptions: JSON.stringify(['D1']),
        keywords: null, // Null
        final_url: 'https://example.com',
        daily_budget: null,
        tone: null,
        last_prompt: 'Test',
        metadata: null, // Null
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      };

      const db = createMockDb({ historyRecord, updatedDraft });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts/1/select-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          historyId: 10,
        }),
      });

      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.draft.keywords).toBeNull();
      expect(json.draft.metadata).toBeNull();
    });

    it('clears previous selections and marks new selection', async () => {
      const historyRecord = {
        id: 10,
        draft_id: 1,
        prompt: 'Test',
        generated_content: JSON.stringify({
          candidates: [
            {
              headlines: ['H1'],
              descriptions: ['D1'],
              suggestedKeywords: ['k1'],
            },
          ],
        }),
      };

      const updatedDraft = {
        id: 1,
        campaign_name: 'Test',
        ad_type: 'search',
        status: 'draft',
        language: 'ja',
        product_id: null,
        product_name: null,
        product_description: null,
        target_audience: null,
        headlines: JSON.stringify(['H1']),
        descriptions: JSON.stringify(['D1']),
        keywords: JSON.stringify(['k1']),
        final_url: 'https://example.com',
        daily_budget: null,
        tone: null,
        last_prompt: 'Test',
        metadata: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      };

      const db = createMockDb({ historyRecord, updatedDraft });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/drafts/1/select-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          historyId: 10,
        }),
      });

      expect(res.status).toBe(200);

      // Verify that prepare was called with UPDATE statements
      const prepareCall = db.prepare as any;
      const calls = prepareCall.mock.calls;

      // Check that there's an UPDATE to clear previous selections
      const clearCall = calls.find((call: any) =>
        call[0].includes('UPDATE ad_generation_history SET selected = 0')
      );
      expect(clearCall).toBeDefined();

      // Check that there's an UPDATE to mark the new selection
      const selectCall = calls.find((call: any) =>
        call[0].includes('UPDATE ad_generation_history SET selected = 1')
      );
      expect(selectCall).toBeDefined();
    });
  });
});
