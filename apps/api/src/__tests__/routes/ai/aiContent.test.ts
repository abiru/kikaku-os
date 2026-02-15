import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import aiContent from '../../../routes/ai/aiContent';

vi.mock('../../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
}));

vi.mock('../../../middleware/rbac', () => ({
  loadRbac: async (_c: any, next: any) => next(),
  requirePermission: () => async (_c: any, next: any) => next(),
}));

const mockGenerateContent = vi.fn();
vi.mock('../../../services/ai/contentGeneration', () => ({
  generateContent: (...args: unknown[]) => mockGenerateContent(...args),
}));

const createMockDb = (options: {
  drafts?: any[];
  draft?: any | null;
  countTotal?: number;
}) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        all: vi.fn(async () => {
          if (sql.includes('FROM ai_content_drafts') && !sql.includes('COUNT(*)')) {
            return { results: options.drafts || [] };
          }
          return { results: [] };
        }),
        first: vi.fn(async () => {
          if (sql.includes('COUNT(*)') && sql.includes('ai_content_drafts')) {
            return { total: options.countTotal ?? 0 };
          }
          if (sql.includes('FROM ai_content_drafts')) {
            return options.draft ?? null;
          }
          return null;
        }),
        run: vi.fn(async () => ({ meta: { last_row_id: 1 } })),
      })),
    })),
  };
};

const createApp = (db: ReturnType<typeof createMockDb>, claudeApiKey?: string) => {
  const app = new Hono();
  app.route('/ai', aiContent);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, {
        DB: db,
        CLAUDE_API_KEY: claudeApiKey ?? 'test-key',
      } as any),
  };
};

describe('AI Content API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /ai/content/generate', () => {
    it('generates content and returns draft + inbox item', async () => {
      mockGenerateContent.mockResolvedValue({
        inboxItemId: 10,
        draftId: 5,
        preview: 'Generated preview text',
      });

      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/ai/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'product_description',
          prompt: 'Write a product description',
          context: { productTitle: 'Test Product' },
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.inboxItemId).toBe(10);
      expect(json.draftId).toBe(5);
      expect(json.preview).toBe('Generated preview text');
      expect(json.message).toContain('Content generated successfully');
      expect(mockGenerateContent).toHaveBeenCalledOnce();
    });

    it('returns 400 for missing required fields', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/ai/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'product_description',
          // missing prompt and context
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
    });

    it('returns 400 for invalid type enum', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/ai/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'invalid_type',
          prompt: 'Write something',
          context: {},
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
    });

    it('returns 400 for empty prompt', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/ai/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'email',
          prompt: '',
          context: {},
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
    });

    it('returns 500 when generateContent throws', async () => {
      mockGenerateContent.mockRejectedValue(
        new Error('CLAUDE_API_KEY not configured')
      );

      const db = createMockDb({});
      const { fetch } = createApp(db, undefined);

      const res = await fetch('/ai/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'product_description',
          prompt: 'Write a description',
          context: { productTitle: 'Test' },
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(500);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('CLAUDE_API_KEY not configured');
    });

    it('passes optional fields to generateContent', async () => {
      mockGenerateContent.mockResolvedValue({
        inboxItemId: 1,
        draftId: 1,
        preview: 'Preview',
      });

      const db = createMockDb({});
      const { fetch } = createApp(db);

      await fetch('/ai/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'email',
          refType: 'order',
          refId: 42,
          prompt: 'Draft an email',
          context: { emailType: 'order_confirmation' },
          temperature: 0.5,
        }),
      });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({ CLAUDE_API_KEY: 'test-key' }),
        expect.objectContaining({
          contentType: 'email',
          refType: 'order',
          refId: 42,
          prompt: 'Draft an email',
          context: { emailType: 'order_confirmation' },
          temperature: 0.5,
        })
      );
    });
  });

  describe('GET /ai/content/drafts', () => {
    it('returns list of drafts', async () => {
      const drafts = [
        {
          id: 1,
          content_type: 'product_description',
          ref_type: null,
          ref_id: null,
          status: 'pending',
          model_used: 'claude-sonnet',
          tokens_used: 150,
          generation_time_ms: 1200,
          created_at: '2026-01-15T00:00:00Z',
        },
        {
          id: 2,
          content_type: 'email',
          ref_type: 'order',
          ref_id: 10,
          status: 'pending',
          model_used: 'claude-sonnet',
          tokens_used: 200,
          generation_time_ms: 900,
          created_at: '2026-01-15T00:01:00Z',
        },
      ];

      const db = createMockDb({ drafts, countTotal: 2 });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/content/drafts');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.drafts).toHaveLength(2);
      expect(json.meta.total).toBe(2);
      expect(json.meta.limit).toBe(50);
      expect(json.meta.offset).toBe(0);
    });

    it('returns empty list when no drafts exist', async () => {
      const db = createMockDb({ drafts: [], countTotal: 0 });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/content/drafts');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.drafts).toHaveLength(0);
      expect(json.meta.total).toBe(0);
    });

    it('respects query parameters for filtering', async () => {
      const db = createMockDb({ drafts: [], countTotal: 0 });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/content/drafts?type=email&status=approved&limit=10&offset=5');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.meta.limit).toBe(10);
      expect(json.meta.offset).toBe(5);
    });

    it('caps limit at 200', async () => {
      const db = createMockDb({ drafts: [], countTotal: 0 });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/content/drafts?limit=500');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.meta.limit).toBe(200);
    });
  });

  describe('GET /ai/content/drafts/:id', () => {
    it('returns a single draft', async () => {
      const draft = {
        id: 1,
        content_type: 'product_description',
        ref_type: null,
        ref_id: null,
        prompt: 'Write a product description',
        generated_content: 'Generated content here',
        status: 'pending',
        model_used: 'claude-sonnet',
        tokens_used: 150,
        generation_time_ms: 1200,
        metadata: '{"productTitle":"Test"}',
        created_at: '2026-01-15T00:00:00Z',
        updated_at: '2026-01-15T00:00:00Z',
      };

      const db = createMockDb({ draft });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/content/drafts/1');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.draft).toBeDefined();
      expect(json.draft.id).toBe(1);
      expect(json.draft.content_type).toBe('product_description');
    });

    it('returns 404 when draft not found', async () => {
      const db = createMockDb({ draft: null });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/content/drafts/999');
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Draft not found');
    });
  });

  describe('POST /ai/content/drafts/:id/regenerate', () => {
    it('regenerates content from existing draft', async () => {
      const originalDraft = {
        content_type: 'product_description',
        ref_type: 'product',
        ref_id: 42,
        prompt: 'Original prompt',
        metadata: JSON.stringify({ productTitle: 'Test Product' }),
      };

      mockGenerateContent.mockResolvedValue({
        inboxItemId: 20,
        draftId: 10,
        preview: 'Regenerated preview',
      });

      // Create a mock DB that returns the original draft for SELECT and runs UPDATE
      const db = {
        prepare: vi.fn((sql: string) => ({
          bind: vi.fn((..._args: unknown[]) => ({
            first: vi.fn(async () => {
              if (sql.includes('FROM ai_content_drafts WHERE id')) {
                return originalDraft;
              }
              return null;
            }),
            run: vi.fn(async () => ({ meta: { last_row_id: 1 } })),
            all: vi.fn(async () => ({ results: [] })),
          })),
        })),
      };

      const { fetch } = createApp(db as any);

      const res = await fetch('/ai/content/drafts/1/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modifiedPrompt: 'Improved prompt',
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.inboxItemId).toBe(20);
      expect(json.draftId).toBe(10);
      expect(json.preview).toBe('Regenerated preview');
      expect(json.message).toContain('Content regenerated successfully');
      expect(mockGenerateContent).toHaveBeenCalledOnce();
    });

    it('returns 404 when original draft not found', async () => {
      const db = {
        prepare: vi.fn((_sql: string) => ({
          bind: vi.fn((..._args: unknown[]) => ({
            first: vi.fn(async () => null),
            run: vi.fn(async () => ({ meta: { last_row_id: 1 } })),
            all: vi.fn(async () => ({ results: [] })),
          })),
        })),
      };

      const { fetch } = createApp(db as any);

      const res = await fetch('/ai/content/drafts/999/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Original draft not found');
    });

    it('regenerates with original prompt when modifiedPrompt not provided', async () => {
      const originalDraft = {
        content_type: 'email',
        ref_type: null,
        ref_id: null,
        prompt: 'Original prompt for email',
        metadata: null,
      };

      mockGenerateContent.mockResolvedValue({
        inboxItemId: 30,
        draftId: 15,
        preview: 'Regenerated with original prompt',
      });

      const db = {
        prepare: vi.fn((sql: string) => ({
          bind: vi.fn((..._args: unknown[]) => ({
            first: vi.fn(async () => {
              if (sql.includes('FROM ai_content_drafts WHERE id')) {
                return originalDraft;
              }
              return null;
            }),
            run: vi.fn(async () => ({ meta: { last_row_id: 1 } })),
            all: vi.fn(async () => ({ results: [] })),
          })),
        })),
      };

      const { fetch } = createApp(db as any);

      const res = await fetch('/ai/content/drafts/1/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          prompt: 'Original prompt for email',
        })
      );
    });

    it('returns 500 when regeneration service fails', async () => {
      const originalDraft = {
        content_type: 'product_description',
        ref_type: null,
        ref_id: null,
        prompt: 'Original prompt',
        metadata: null,
      };

      mockGenerateContent.mockRejectedValue(
        new Error('Service unavailable')
      );

      const db = {
        prepare: vi.fn((sql: string) => ({
          bind: vi.fn((..._args: unknown[]) => ({
            first: vi.fn(async () => {
              if (sql.includes('FROM ai_content_drafts WHERE id')) {
                return originalDraft;
              }
              return null;
            }),
            run: vi.fn(async () => ({ meta: { last_row_id: 1 } })),
            all: vi.fn(async () => ({ results: [] })),
          })),
        })),
      };

      const { fetch } = createApp(db as any);

      const res = await fetch('/ai/content/drafts/1/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(500);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Service unavailable');
    });
  });
});
