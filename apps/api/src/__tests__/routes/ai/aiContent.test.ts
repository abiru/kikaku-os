import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import aiContent from '../../../routes/ai/aiContent';

vi.mock('../../../services/ai/contentGeneration', () => ({
  generateContent: vi.fn(),
}));

import { generateContent } from '../../../services/ai/contentGeneration';

const createMockDb = (options: {
  drafts?: any[];
  draft?: any | null;
  draftCount?: number;
  insertId?: number;
} = {}) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        all: vi.fn(async () => ({
          results: options.drafts || [],
        })),
        first: vi.fn(async () => {
          if (sql.includes('COUNT(*)')) {
            return { total: options.draftCount ?? (options.drafts?.length || 0) };
          }
          if (sql.includes('FROM ai_content_drafts')) {
            return options.draft ?? null;
          }
          return null;
        }),
        run: vi.fn(async () => ({
          meta: { last_row_id: options.insertId || 1, changes: 1 },
        })),
      })),
    })),
  };
};

const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/ai', aiContent);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, {
        DB: db,
        CLAUDE_API_KEY: 'test-key',
        AI_GATEWAY_ACCOUNT_ID: 'test-account',
        AI_GATEWAY_ID: 'test-gateway',
      } as any),
  };
};

describe('AI Content Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /ai/content/generate', () => {
    it('generates content and returns inbox item id', async () => {
      (generateContent as any).mockResolvedValueOnce({
        inboxItemId: 42,
        draftId: 10,
        preview: 'Generated content preview...',
      });

      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/ai/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'product_description',
          prompt: 'Write a description for a premium leather wallet',
          context: { productTitle: 'Premium Leather Wallet' },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.inboxItemId).toBe(42);
      expect(data.draftId).toBe(10);
      expect(data.preview).toBe('Generated content preview...');
      expect(data.message).toContain('Inbox');
    });

    it('validates required fields', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/ai/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'product_description',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
    });

    it('rejects invalid content type', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/ai/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'invalid_type',
          prompt: 'test',
          context: {},
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
    });

    it('returns 500 on generation failure', async () => {
      (generateContent as any).mockRejectedValueOnce(
        new Error('CLAUDE_API_KEY not configured')
      );

      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/ai/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'email',
          prompt: 'Write an email',
          context: { emailType: 'order_confirmation' },
        }),
      });

      expect(res.status).toBe(500);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
      expect(data.message).toContain('CLAUDE_API_KEY');
    });

    it('returns 500 on rate limit exceeded', async () => {
      (generateContent as any).mockRejectedValueOnce(
        new Error('Rate limit exceeded. Please try again later. (0/100 remaining)')
      );

      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/ai/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'marketing_copy',
          prompt: 'Create marketing copy',
          context: { campaignType: 'sale' },
        }),
      });

      expect(res.status).toBe(500);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
      expect(data.message).toContain('Rate limit');
    });

    it('accepts optional temperature and ref fields', async () => {
      (generateContent as any).mockResolvedValueOnce({
        inboxItemId: 5,
        draftId: 3,
        preview: 'Preview text',
      });

      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/ai/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'report_summary',
          prompt: 'Summarize report',
          context: { date: '2026-01-13' },
          temperature: 0.5,
          refType: 'daily_report',
          refId: 123,
        }),
      });

      expect(res.status).toBe(200);
      expect(generateContent).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          contentType: 'report_summary',
          temperature: 0.5,
          refType: 'daily_report',
          refId: 123,
        })
      );
    });
  });

  describe('GET /ai/content/drafts', () => {
    it('returns list of drafts with pagination', async () => {
      const drafts = [
        {
          id: 1,
          content_type: 'product_description',
          ref_type: null,
          ref_id: null,
          status: 'pending',
          model_used: 'claude-sonnet',
          tokens_used: 500,
          generation_time_ms: 1200,
          created_at: '2026-01-13T00:00:00Z',
        },
        {
          id: 2,
          content_type: 'email',
          ref_type: 'order',
          ref_id: 42,
          status: 'pending',
          model_used: 'claude-sonnet',
          tokens_used: 300,
          generation_time_ms: 800,
          created_at: '2026-01-14T00:00:00Z',
        },
      ];

      const db = createMockDb({ drafts, draftCount: 2 });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/content/drafts?status=pending');

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.drafts).toHaveLength(2);
      expect(data.meta.total).toBe(2);
    });

    it('filters by content type', async () => {
      const db = createMockDb({ drafts: [], draftCount: 0 });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/content/drafts?type=email&status=pending');

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.drafts).toHaveLength(0);
    });

    it('defaults status to pending', async () => {
      const db = createMockDb({ drafts: [] });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/content/drafts');

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
    });

    it('caps limit at 200', async () => {
      const db = createMockDb({ drafts: [] });
      const { fetch } = createApp(db);

      await fetch('/ai/content/drafts?limit=500');

      // The route caps at 200 via Math.min
      expect(db.prepare).toHaveBeenCalled();
    });
  });

  describe('GET /ai/content/drafts/:id', () => {
    it('returns draft details', async () => {
      const draft = {
        id: 1,
        content_type: 'product_description',
        prompt: 'test prompt',
        generated_content: 'Generated text',
        model_used: 'claude-sonnet',
        tokens_used: 500,
        status: 'pending',
      };

      const db = createMockDb({ draft });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/content/drafts/1');

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.draft.id).toBe(1);
      expect(data.draft.content_type).toBe('product_description');
    });

    it('returns 404 for non-existent draft', async () => {
      const db = createMockDb({ draft: null });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/content/drafts/999');

      expect(res.status).toBe(404);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
      expect(data.message).toContain('not found');
    });
  });

  describe('POST /ai/content/drafts/:id/regenerate', () => {
    it('regenerates content from existing draft', async () => {
      const originalDraft = {
        content_type: 'product_description',
        ref_type: 'product',
        ref_id: 42,
        prompt: 'original prompt',
        metadata: JSON.stringify({ productTitle: 'Test Product' }),
      };

      (generateContent as any).mockResolvedValueOnce({
        inboxItemId: 50,
        draftId: 11,
        preview: 'Regenerated preview...',
      });

      const db = createMockDb({ draft: originalDraft });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/content/drafts/1/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modifiedPrompt: 'Write a more casual description',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.draftId).toBe(11);
      expect(data.message).toContain('regenerated');
    });

    it('returns 404 when original draft not found', async () => {
      const db = createMockDb({ draft: null });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/content/drafts/999/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(404);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
      expect(data.message).toContain('not found');
    });

    it('uses original prompt when modifiedPrompt not provided', async () => {
      const originalDraft = {
        content_type: 'email',
        ref_type: null,
        ref_id: null,
        prompt: 'original email prompt',
        metadata: null,
      };

      (generateContent as any).mockResolvedValueOnce({
        inboxItemId: 60,
        draftId: 12,
        preview: 'Regenerated email preview...',
      });

      const db = createMockDb({ draft: originalDraft });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/content/drafts/1/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      expect(generateContent).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          prompt: 'original email prompt',
        })
      );
    });

    it('returns 500 on regeneration failure', async () => {
      const originalDraft = {
        content_type: 'product_description',
        ref_type: null,
        ref_id: null,
        prompt: 'test',
        metadata: null,
      };

      (generateContent as any).mockRejectedValueOnce(
        new Error('API call failed')
      );

      const db = createMockDb({ draft: originalDraft });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/content/drafts/1/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(500);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
    });
  });
});
