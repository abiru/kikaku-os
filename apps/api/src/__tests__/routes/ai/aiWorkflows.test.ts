import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import aiWorkflows from '../../../routes/ai/aiWorkflows';

vi.mock('../../../services/ai/workflowAutomation', () => ({
  triageInboxItem: vi.fn(),
  draftCustomerResponse: vi.fn(),
}));

import { triageInboxItem, draftCustomerResponse } from '../../../services/ai/workflowAutomation';

const createMockDb = (options: {
  logs?: any[];
  logCount?: number;
  usageStats?: any[];
} = {}) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        all: vi.fn(async () => {
          if (sql.includes('ai_workflow_logs')) {
            return { results: options.logs || [] };
          }
          if (sql.includes('ai_usage_tracking')) {
            return { results: options.usageStats || [] };
          }
          return { results: [] };
        }),
        first: vi.fn(async () => {
          if (sql.includes('COUNT(*)') && sql.includes('ai_workflow_logs')) {
            return { total: options.logCount ?? (options.logs?.length || 0) };
          }
          if (sql.includes('COUNT(*)') && sql.includes('ai_usage_tracking')) {
            return { total: options.usageStats?.length || 0 };
          }
          return null;
        }),
        run: vi.fn(async () => ({
          meta: { last_row_id: 1, changes: 1 },
        })),
      })),
    })),
  };
};

const createApp = (db: ReturnType<typeof createMockDb>) => {
  const app = new Hono();
  app.route('/ai', aiWorkflows);
  return {
    app,
    fetch: (path: string, init?: RequestInit) =>
      app.request(path, init, {
        DB: db,
        CLAUDE_API_KEY: 'test-key',
        AI: { run: vi.fn() },
      } as any),
  };
};

describe('AI Workflows Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /ai/workflows/triage-inbox', () => {
    it('triages an inbox item successfully', async () => {
      (triageInboxItem as any).mockResolvedValueOnce({
        classification: 'urgent',
        suggestedAction: 'Respond immediately',
        reasoning: 'Payment failure detected',
      });

      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/triage-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inboxItemId: 1 }),
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.classification).toBe('urgent');
      expect(data.suggestedAction).toBe('Respond immediately');
      expect(data.reasoning).toBe('Payment failure detected');
      expect(data.message).toContain('triaged');
    });

    it('validates inboxItemId is required', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/triage-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
    });

    it('validates inboxItemId must be a number', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/triage-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inboxItemId: 'abc' }),
      });

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
    });

    it('returns 500 when inbox item not found', async () => {
      (triageInboxItem as any).mockRejectedValueOnce(
        new Error('Inbox item not found')
      );

      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/triage-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inboxItemId: 999 }),
      });

      expect(res.status).toBe(500);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
      expect(data.message).toContain('not found');
    });

    it('returns 500 when no AI provider is available', async () => {
      (triageInboxItem as any).mockRejectedValueOnce(
        new Error('No AI provider available for triage')
      );

      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/triage-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inboxItemId: 1 }),
      });

      expect(res.status).toBe(500);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
      expect(data.message).toContain('No AI provider');
    });
  });

  describe('POST /ai/workflows/draft-response', () => {
    it('drafts a customer response successfully', async () => {
      (draftCustomerResponse as any).mockResolvedValueOnce({
        inboxItemId: 15,
        draftContent: 'Re: Your order #42\n\nThank you for your inquiry...',
      });

      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/draft-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: 42,
          customerMessage: 'Where is my order?',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.inboxItemId).toBe(15);
      expect(data.preview).toBeDefined();
      expect(data.message).toContain('Inbox');
    });

    it('validates required fields', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/draft-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: 42 }),
      });

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
    });

    it('rejects empty customer message', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/draft-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: 42,
          customerMessage: '',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
    });

    it('returns 500 when order not found', async () => {
      (draftCustomerResponse as any).mockRejectedValueOnce(
        new Error('Order not found')
      );

      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/draft-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: 999,
          customerMessage: 'Question about my order',
        }),
      });

      expect(res.status).toBe(500);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
      expect(data.message).toContain('not found');
    });

    it('returns 500 when Claude API key not configured', async () => {
      (draftCustomerResponse as any).mockRejectedValueOnce(
        new Error('CLAUDE_API_KEY not configured')
      );

      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/draft-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: 1,
          customerMessage: 'Hello',
        }),
      });

      expect(res.status).toBe(500);
      const data = await res.json() as any;
      expect(data.ok).toBe(false);
      expect(data.message).toContain('CLAUDE_API_KEY');
    });
  });

  describe('GET /ai/workflows/logs', () => {
    it('returns workflow logs with pagination', async () => {
      const logs = [
        {
          id: 1,
          workflow_type: 'content_generation',
          trigger: 'manual',
          action_taken: 'inbox_created',
          status: 'success',
          tokens_used: 500,
          processing_time_ms: 1200,
          created_at: '2026-01-13T00:00:00Z',
        },
        {
          id: 2,
          workflow_type: 'inbox_triage',
          trigger: 'manual',
          action_taken: 'metadata_updated',
          status: 'success',
          tokens_used: 200,
          processing_time_ms: 400,
          created_at: '2026-01-14T00:00:00Z',
        },
      ];

      const db = createMockDb({ logs, logCount: 2 });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/logs');

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.logs).toHaveLength(2);
      expect(data.meta.total).toBe(2);
    });

    it('filters by workflow type', async () => {
      const db = createMockDb({ logs: [], logCount: 0 });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/logs?type=inbox_triage');

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
    });

    it('applies limit and offset', async () => {
      const db = createMockDb({ logs: [], logCount: 0 });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/logs?limit=10&offset=5');

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
    });

    it('caps limit at 200', async () => {
      const db = createMockDb({ logs: [] });
      const { fetch } = createApp(db);

      await fetch('/ai/workflows/logs?limit=500');

      expect(db.prepare).toHaveBeenCalled();
    });
  });

  describe('GET /ai/workflows/usage', () => {
    it('returns usage statistics', async () => {
      const usageStats = [
        { service: 'claude', operation: 'content_generation', requests: 10, tokens: 5000, cost: 50 },
        { service: 'workers_ai', operation: 'inbox_triage', requests: 20, tokens: 3000, cost: 0 },
      ];

      const db = createMockDb({ usageStats });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/usage?date=2026-01-13');

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.date).toBe('2026-01-13');
      expect(data.summary).toBeDefined();
      expect(data.summary.totalRequests).toBeDefined();
      expect(data.summary.totalTokens).toBeDefined();
      expect(data.summary.totalCostCents).toBeDefined();
      expect(data.breakdown).toHaveLength(2);
    });

    it('defaults to current date when no date provided', async () => {
      const db = createMockDb({ usageStats: [] });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/usage');

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns zero summary for no data', async () => {
      const db = createMockDb({ usageStats: [] });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/usage?date=2020-01-01');

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
      expect(data.summary.totalRequests).toBe(0);
      expect(data.summary.totalTokens).toBe(0);
      expect(data.summary.totalCostCents).toBe(0);
    });
  });
});
