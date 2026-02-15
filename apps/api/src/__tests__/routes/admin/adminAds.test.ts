import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import adminAds from '../../../routes/admin/adminAds';

// Mock dependencies
vi.mock('../../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
}));

vi.mock('../../../middleware/rbac', () => ({
  loadRbac: async (_c: any, next: any) => next(),
  requirePermission: () => async (_c: any, next: any) => next(),
}));

vi.mock('../../../services/claudeAds', () => ({
  generateAdCopy: vi.fn(),
}));

import { generateAdCopy } from '../../../services/claudeAds';

type MockDbOptions = {
  inboxItem?: { id: number } | null;
  insertLastRowId?: number;
};

const createMockDb = (options: MockDbOptions = {}) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        first: vi.fn(async () => {
          if (sql.includes('INSERT INTO inbox_items')) {
            return options.inboxItem || { id: options.insertLastRowId || 42 };
          }
          return null;
        }),
        run: vi.fn(async () => ({
          meta: { last_row_id: options.insertLastRowId || 1, changes: 1 },
        })),
      })),
    })),
  };
};

const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/admin/ads', adminAds);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, {
        DB: db,
        CLAUDE_API_KEY: 'test-api-key',
        AI_GATEWAY_ACCOUNT_ID: 'test-account',
        AI_GATEWAY_ID: 'test-gateway',
      } as any),
  };
};

describe('Admin Ads - AI Generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /admin/ads/generate', () => {
    it('generates ad copy and creates inbox item', async () => {
      const mockCandidates = [
        {
          headlines: ['Headline 1', 'Headline 2', 'Headline 3'],
          descriptions: ['Desc 1', 'Desc 2'],
          suggestedKeywords: ['keyword1', 'keyword2'],
        },
      ];

      (generateAdCopy as any).mockResolvedValueOnce({
        candidates: mockCandidates,
        promptUsed: 'Test prompt',
      });

      const db = createMockDb({ inboxItem: { id: 42 } });
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: 'Test Product',
          productDescription: 'Test Description',
          targetAudience: 'Test Audience',
          keywords: ['test', 'product'],
          tone: 'professional',
          language: 'ja',
          adType: 'search',
          finalUrl: 'https://example.com',
        }),
      });

      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.inboxItemId).toBe(42);
      expect(json.message).toContain('inbox');
      expect(generateAdCopy).toHaveBeenCalledTimes(1);
    });

    it('returns 500 when Claude API key is missing', async () => {
      const db = createMockDb({});
      const app = new Hono();
      app.route('/admin/ads', adminAds);

      const res = await app.request(
        '/admin/ads/generate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productName: 'Test Product',
            productDescription: 'Test Description',
            targetAudience: 'Test Audience',
            keywords: ['test'],
            tone: 'professional',
            language: 'ja',
            adType: 'search',
            finalUrl: 'https://example.com',
          }),
        },
        { DB: db } as any
      );

      const json = (await res.json()) as any;

      expect(res.status).toBe(500);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Claude API key not configured');
    });

    it('validates required fields', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: 'Test Product',
          // Missing required fields
        }),
      });

      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.ok).toBe(false);
    });

    it('validates URL format', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: 'Test Product',
          productDescription: 'Test Description',
          targetAudience: 'Test Audience',
          keywords: ['test'],
          tone: 'professional',
          language: 'ja',
          adType: 'search',
          finalUrl: 'not-a-valid-url',
        }),
      });

      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.ok).toBe(false);
    });

    it('validates keyword count limits', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      // Test minimum keywords
      const resMin = await fetch('/admin/ads/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: 'Test Product',
          productDescription: 'Test Description',
          targetAudience: 'Test Audience',
          keywords: [], // Empty array
          tone: 'professional',
          language: 'ja',
          adType: 'search',
          finalUrl: 'https://example.com',
        }),
      });

      expect(resMin.status).toBe(400);

      // Test maximum keywords (over 20)
      const tooManyKeywords = Array.from({ length: 21 }, (_, i) => `keyword${i}`);
      const resMax = await fetch('/admin/ads/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: 'Test Product',
          productDescription: 'Test Description',
          targetAudience: 'Test Audience',
          keywords: tooManyKeywords,
          tone: 'professional',
          language: 'ja',
          adType: 'search',
          finalUrl: 'https://example.com',
        }),
      });

      expect(resMax.status).toBe(400);
    });

    it('handles AI generation errors gracefully', async () => {
      (generateAdCopy as any).mockRejectedValueOnce(new Error('AI service unavailable'));

      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/admin/ads/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: 'Test Product',
          productDescription: 'Test Description',
          targetAudience: 'Test Audience',
          keywords: ['test'],
          tone: 'professional',
          language: 'ja',
          adType: 'search',
          finalUrl: 'https://example.com',
        }),
      });

      expect(res.status).toBe(500);
      const json = (await res.json()) as any;
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Ad generation failed');
    });

    it('returns 500 when inbox item creation fails', async () => {
      (generateAdCopy as any).mockResolvedValueOnce({
        candidates: [
          {
            headlines: ['H1', 'H2'],
            descriptions: ['D1'],
            suggestedKeywords: ['k1'],
          },
        ],
        promptUsed: 'Test',
      });

      // Return null to simulate inbox creation failure
      const failingDb = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            first: vi.fn(async () => null), // Simulate failure
          })),
        })),
      };

      const app = new Hono();
      app.route('/admin/ads', adminAds);
      const res = await app.request(
        '/admin/ads/generate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productName: 'Test Product',
            productDescription: 'Test Description',
            targetAudience: 'Test Audience',
            keywords: ['test'],
            tone: 'professional',
            language: 'ja',
            adType: 'search',
            finalUrl: 'https://example.com',
          }),
        },
        {
          DB: failingDb,
          CLAUDE_API_KEY: 'test-key',
          AI_GATEWAY_ACCOUNT_ID: 'test-account',
          AI_GATEWAY_ID: 'test-gateway',
        } as any
      );

      expect(res.status).toBe(500);
      const json = (await res.json()) as any;
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Failed to create inbox item');
    });

    it('accepts all valid ad types', async () => {
      (generateAdCopy as any).mockResolvedValue({
        candidates: [
          {
            headlines: ['H1'],
            descriptions: ['D1'],
            suggestedKeywords: ['k1'],
          },
        ],
        promptUsed: 'Test',
      });

      const db = createMockDb({ inboxItem: { id: 42 } });
      const { fetch } = createApp(db);

      const adTypes = ['search', 'display', 'performance_max'];

      for (const adType of adTypes) {
        const res = await fetch('/admin/ads/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productName: 'Test Product',
            productDescription: 'Test Description',
            targetAudience: 'Test Audience',
            keywords: ['test'],
            tone: 'professional',
            language: 'ja',
            adType,
            finalUrl: 'https://example.com',
          }),
        });

        expect(res.status).toBe(200);
      }
    });

    it('accepts all valid tones', async () => {
      (generateAdCopy as any).mockResolvedValue({
        candidates: [
          {
            headlines: ['H1'],
            descriptions: ['D1'],
            suggestedKeywords: ['k1'],
          },
        ],
        promptUsed: 'Test',
      });

      const db = createMockDb({ inboxItem: { id: 42 } });
      const { fetch } = createApp(db);

      const tones = ['professional', 'casual', 'urgent', 'informative'];

      for (const tone of tones) {
        const res = await fetch('/admin/ads/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productName: 'Test Product',
            productDescription: 'Test Description',
            targetAudience: 'Test Audience',
            keywords: ['test'],
            tone,
            language: 'ja',
            adType: 'search',
            finalUrl: 'https://example.com',
          }),
        });

        expect(res.status).toBe(200);
      }
    });

    it('accepts both ja and en languages', async () => {
      (generateAdCopy as any).mockResolvedValue({
        candidates: [
          {
            headlines: ['H1'],
            descriptions: ['D1'],
            suggestedKeywords: ['k1'],
          },
        ],
        promptUsed: 'Test',
      });

      const db = createMockDb({ inboxItem: { id: 42 } });
      const { fetch } = createApp(db);

      for (const language of ['ja', 'en']) {
        const res = await fetch('/admin/ads/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productName: 'Test Product',
            productDescription: 'Test Description',
            targetAudience: 'Test Audience',
            keywords: ['test'],
            tone: 'professional',
            language,
            adType: 'search',
            finalUrl: 'https://example.com',
          }),
        });

        expect(res.status).toBe(200);
      }
    });
  });
});
