import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import aiWorkflows from '../../../routes/ai/aiWorkflows';

vi.mock('../../../middleware/clerkAuth', () => ({
  getActor: () => 'test-admin',
}));

vi.mock('../../../middleware/rbac', () => ({
  loadRbac: async (_c: any, next: any) => next(),
  requirePermission: () => async (_c: any, next: any) => next(),
}));

const mockTriageInboxItem = vi.fn();
const mockDraftCustomerResponse = vi.fn();
vi.mock('../../../services/ai/workflowAutomation', () => ({
  triageInboxItem: (...args: unknown[]) => mockTriageInboxItem(...args),
  draftCustomerResponse: (...args: unknown[]) => mockDraftCustomerResponse(...args),
}));

const createMockDb = (options: {
  logs?: any[];
  logCountTotal?: number;
  usageStats?: any[];
}) => {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        all: vi.fn(async () => {
          if (sql.includes('FROM ai_workflow_logs') && !sql.includes('COUNT(*)')) {
            return { results: options.logs || [] };
          }
          if (sql.includes('FROM ai_usage_tracking')) {
            return { results: options.usageStats || [] };
          }
          return { results: [] };
        }),
        first: vi.fn(async () => {
          if (sql.includes('COUNT(*)') && sql.includes('ai_workflow_logs')) {
            return { total: options.logCountTotal ?? 0 };
          }
          return null;
        }),
        run: vi.fn(async () => ({ meta: { last_row_id: 1 } })),
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
      } as any),
  };
};

describe('AI Workflows API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /ai/workflows/triage-inbox', () => {
    it('triages an inbox item successfully', async () => {
      mockTriageInboxItem.mockResolvedValue({
        classification: 'urgent',
        suggestedAction: 'Escalate to support team',
        reasoning: 'Payment failure detected',
      });

      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/triage-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inboxItemId: 1 }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.classification).toBe('urgent');
      expect(json.suggestedAction).toBe('Escalate to support team');
      expect(json.reasoning).toBe('Payment failure detected');
      expect(json.message).toContain('triaged successfully');
      expect(mockTriageInboxItem).toHaveBeenCalledWith(
        expect.objectContaining({ CLAUDE_API_KEY: 'test-key' }),
        1
      );
    });

    it('returns 400 when inboxItemId is missing', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/triage-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
    });

    it('returns 400 when inboxItemId is not a number', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/triage-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inboxItemId: 'abc' }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
    });

    it('returns 500 when triage service fails', async () => {
      mockTriageInboxItem.mockRejectedValue(
        new Error('Inbox item not found')
      );

      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/triage-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inboxItemId: 999 }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(500);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Inbox item not found');
    });
  });

  describe('POST /ai/workflows/draft-response', () => {
    it('drafts a customer response successfully', async () => {
      mockDraftCustomerResponse.mockResolvedValue({
        inboxItemId: 5,
        draftContent: 'Subject line\n\nDear customer, thank you for reaching out...',
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
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.inboxItemId).toBe(5);
      expect(json.preview).toBeDefined();
      expect(json.message).toContain('Email draft created');
      expect(mockDraftCustomerResponse).toHaveBeenCalledWith(
        expect.objectContaining({ CLAUDE_API_KEY: 'test-key' }),
        42,
        'Where is my order?'
      );
    });

    it('returns 400 when orderId is missing', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/draft-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerMessage: 'Where is my order?',
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
    });

    it('returns 400 when customerMessage is missing', async () => {
      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/draft-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: 42,
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
    });

    it('returns 400 when customerMessage is empty', async () => {
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
      const json = (await res.json()) as any;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
    });

    it('returns 500 when draft service fails', async () => {
      mockDraftCustomerResponse.mockRejectedValue(
        new Error('Order not found')
      );

      const db = createMockDb({});
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/draft-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: 999,
          customerMessage: 'Help needed',
        }),
      });
      const json = (await res.json()) as any;

      expect(res.status).toBe(500);
      expect(json.ok).toBe(false);
      expect(json.message).toContain('Order not found');
    });
  });

  describe('GET /ai/workflows/logs', () => {
    it('returns list of workflow logs', async () => {
      const logs = [
        {
          id: 1,
          workflow_type: 'inbox_triage',
          trigger: 'manual',
          action_taken: 'metadata_updated',
          status: 'success',
          tokens_used: 200,
          processing_time_ms: 800,
          created_at: '2026-01-15T00:00:00Z',
        },
        {
          id: 2,
          workflow_type: 'content_generation',
          trigger: 'manual',
          action_taken: 'inbox_created',
          status: 'success',
          tokens_used: 350,
          processing_time_ms: 1500,
          created_at: '2026-01-15T00:01:00Z',
        },
      ];

      const db = createMockDb({ logs, logCountTotal: 2 });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/logs');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.logs).toHaveLength(2);
      expect(json.meta.total).toBe(2);
      expect(json.meta.limit).toBe(50);
      expect(json.meta.offset).toBe(0);
    });

    it('returns empty list when no logs exist', async () => {
      const db = createMockDb({ logs: [], logCountTotal: 0 });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/logs');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.logs).toHaveLength(0);
      expect(json.meta.total).toBe(0);
    });

    it('respects type filter query parameter', async () => {
      const db = createMockDb({ logs: [], logCountTotal: 0 });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/logs?type=inbox_triage');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
    });

    it('respects limit and offset query parameters', async () => {
      const db = createMockDb({ logs: [], logCountTotal: 0 });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/logs?limit=10&offset=20');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.meta.limit).toBe(10);
      expect(json.meta.offset).toBe(20);
    });

    it('caps limit at 200', async () => {
      const db = createMockDb({ logs: [], logCountTotal: 0 });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/logs?limit=500');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.meta.limit).toBe(200);
    });
  });

  describe('GET /ai/workflows/usage', () => {
    it('returns usage statistics', async () => {
      const usageStats = [
        {
          service: 'claude',
          operation: 'content_generation',
          requests: 10,
          tokens: 5000,
          cost: 150,
        },
        {
          service: 'claude',
          operation: 'inbox_triage',
          requests: 25,
          tokens: 3000,
          cost: 90,
        },
      ];

      const db = createMockDb({ usageStats });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/usage');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.date).toBeDefined();
      expect(json.summary).toBeDefined();
      expect(json.summary.totalRequests).toBe(35);
      expect(json.summary.totalTokens).toBe(8000);
      expect(json.summary.totalCostCents).toBe(240);
      expect(json.summary.totalCostUSD).toBe('2.40');
      expect(json.breakdown).toHaveLength(2);
    });

    it('returns zero stats when no usage data exists', async () => {
      const db = createMockDb({ usageStats: [] });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/usage');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.summary.totalRequests).toBe(0);
      expect(json.summary.totalTokens).toBe(0);
      expect(json.summary.totalCostCents).toBe(0);
      expect(json.summary.totalCostUSD).toBe('0.00');
      expect(json.breakdown).toHaveLength(0);
    });

    it('accepts date query parameter', async () => {
      const db = createMockDb({ usageStats: [] });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/usage?date=2026-01-15');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.date).toBe('2026-01-15');
    });

    it('defaults to today when no date provided', async () => {
      const db = createMockDb({ usageStats: [] });
      const { fetch } = createApp(db);

      const res = await fetch('/ai/workflows/usage');
      const json = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(json.date).toBeDefined();
      // Should be a date string in YYYY-MM-DD format
      expect(json.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
