import { describe, it, expect, beforeEach, vi } from 'vitest';
import { triageInboxItem, draftCustomerResponse } from '../../../services/ai/workflowAutomation';

// Mock dependencies
vi.mock('../../../services/ai/claudeClient', () => ({
  callClaudeAPI: vi.fn(),
}));

vi.mock('../../../services/ai/rateLimiter', () => ({
  checkRateLimit: vi.fn(),
  trackAIUsage: vi.fn(),
}));

vi.mock('../../../services/ai/modelRouter', () => ({
  selectModel: vi.fn(),
  AITaskType: { TRIAGE: 'triage' },
  AIProvider: { WORKERS_AI: 'workers_ai', CLAUDE: 'claude' },
}));

vi.mock('../../../services/ai/workersAIClient', () => ({
  callLlamaForJSON: vi.fn(),
  estimateTokens: vi.fn().mockReturnValue(50),
}));

import { callClaudeAPI } from '../../../services/ai/claudeClient';
import { checkRateLimit, trackAIUsage } from '../../../services/ai/rateLimiter';
import { selectModel, AIProvider } from '../../../services/ai/modelRouter';
import { callLlamaForJSON } from '../../../services/ai/workersAIClient';

const createMockDb = () => {
  const mockFirst = vi.fn();
  const mockRun = vi.fn().mockResolvedValue({ meta: { last_row_id: 1 } });
  const mockBind = vi.fn(() => ({
    first: mockFirst,
    run: mockRun,
  }));
  const mockPrepare = vi.fn(() => ({
    bind: mockBind,
    first: mockFirst,
    run: mockRun,
  }));

  return {
    prepare: mockPrepare,
    _mocks: { mockFirst, mockRun, mockBind, mockPrepare },
  } as unknown as D1Database & { _mocks: any };
};

describe('workflowAutomation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (checkRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: true,
      remaining: 99,
      limit: 100,
    });
    (trackAIUsage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  describe('triageInboxItem', () => {
    it('should throw when rate limit exceeded', async () => {
      const db = createMockDb();
      const env = { DB: db, CLAUDE_API_KEY: 'sk-test' };

      (selectModel as ReturnType<typeof vi.fn>).mockReturnValue({
        provider: AIProvider.CLAUDE,
        model: 'claude-sonnet',
        canFallback: false,
      });

      (checkRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue({
        allowed: false,
        remaining: 0,
        limit: 100,
      });

      await expect(triageInboxItem(env, 1)).rejects.toThrow('Rate limit exceeded');
    });

    it('should throw when inbox item not found', async () => {
      const db = createMockDb();
      const env = { DB: db, CLAUDE_API_KEY: 'sk-test' };

      (selectModel as ReturnType<typeof vi.fn>).mockReturnValue({
        provider: AIProvider.CLAUDE,
        model: 'claude-sonnet',
        canFallback: false,
      });

      db._mocks.mockFirst.mockResolvedValueOnce(null);

      await expect(triageInboxItem(env, 999)).rejects.toThrow('Inbox item not found');
    });

    it('should triage using Workers AI when selected', async () => {
      const db = createMockDb();
      const mockAI = {} as any;
      const env = { DB: db, AI: mockAI };

      (selectModel as ReturnType<typeof vi.fn>).mockReturnValue({
        provider: AIProvider.WORKERS_AI,
        model: '@cf/meta/llama-3.1-8b-instruct',
        canFallback: false,
      });

      // Inbox item query
      db._mocks.mockFirst.mockResolvedValueOnce({
        id: 1,
        title: 'Payment failed',
        body: 'Customer payment declined',
        severity: 'warning',
        kind: 'payment_error',
        date: '2026-01-01',
        metadata: null,
      });

      (callLlamaForJSON as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          classification: 'urgent',
          suggestedAction: 'Contact customer',
          reasoning: 'Payment failure requires immediate attention',
        },
        rawText: '{"classification":"urgent"}',
      });

      const result = await triageInboxItem(env, 1);

      expect(result.classification).toBe('urgent');
      expect(result.suggestedAction).toBe('Contact customer');
      expect(callLlamaForJSON).toHaveBeenCalled();
      expect(trackAIUsage).toHaveBeenCalledWith(db, 'workers_ai', 'inbox_triage', expect.any(Number));
    });

    it('should triage using Claude when selected', async () => {
      const db = createMockDb();
      const env = { DB: db, CLAUDE_API_KEY: 'sk-test' };

      (selectModel as ReturnType<typeof vi.fn>).mockReturnValue({
        provider: AIProvider.CLAUDE,
        model: 'claude-sonnet',
        canFallback: false,
      });

      db._mocks.mockFirst.mockResolvedValueOnce({
        id: 2,
        title: 'Daily report ready',
        body: 'Report generated',
        severity: 'info',
        kind: 'report',
        date: '2026-01-01',
        metadata: null,
      });

      (callClaudeAPI as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'msg_test',
        model: 'claude-sonnet',
        content: [{ type: 'text', text: '{"classification":"normal","suggestedAction":"Review report","reasoning":"Routine daily report"}' }],
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      });

      const result = await triageInboxItem(env, 2);

      expect(result.classification).toBe('normal');
      expect(result.suggestedAction).toBe('Review report');
      expect(callClaudeAPI).toHaveBeenCalled();
      expect(trackAIUsage).toHaveBeenCalledWith(db, 'claude', 'inbox_triage', 150);
    });

    it('should fallback to Claude when Workers AI fails', async () => {
      const db = createMockDb();
      const mockAI = {} as any;
      const env = { DB: db, AI: mockAI, CLAUDE_API_KEY: 'sk-test' };

      (selectModel as ReturnType<typeof vi.fn>).mockReturnValue({
        provider: AIProvider.WORKERS_AI,
        model: '@cf/meta/llama-3.1-8b-instruct',
        canFallback: true,
        fallbackModel: 'claude-sonnet',
      });

      db._mocks.mockFirst.mockResolvedValueOnce({
        id: 3,
        title: 'Test item',
        body: 'Test body',
        severity: 'info',
        kind: null,
        date: null,
        metadata: null,
      });

      (callLlamaForJSON as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Workers AI unavailable')
      );

      (callClaudeAPI as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'msg_fallback',
        model: 'claude-sonnet',
        content: [{ type: 'text', text: '{"classification":"low","suggestedAction":"Archive","reasoning":"Low priority item"}' }],
        usage: { input_tokens: 80, output_tokens: 30, total_tokens: 110 },
      });

      const result = await triageInboxItem(env, 3);

      expect(result.classification).toBe('low');
      expect(callLlamaForJSON).toHaveBeenCalled();
      expect(callClaudeAPI).toHaveBeenCalled();
    });

    it('should throw when Workers AI fails and no fallback available', async () => {
      const db = createMockDb();
      const mockAI = {} as any;
      const env = { DB: db, AI: mockAI };

      (selectModel as ReturnType<typeof vi.fn>).mockReturnValue({
        provider: AIProvider.WORKERS_AI,
        model: '@cf/meta/llama-3.1-8b-instruct',
        canFallback: false,
      });

      db._mocks.mockFirst.mockResolvedValueOnce({
        id: 4,
        title: 'Test',
        body: null,
        severity: 'info',
        kind: null,
        date: null,
        metadata: null,
      });

      (callLlamaForJSON as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Workers AI unavailable')
      );

      await expect(triageInboxItem(env, 4)).rejects.toThrow('Workers AI unavailable');
    });

    it('should throw when no AI provider is available', async () => {
      const db = createMockDb();
      const env = { DB: db };

      (selectModel as ReturnType<typeof vi.fn>).mockReturnValue({
        provider: AIProvider.CLAUDE,
        model: 'claude-sonnet',
        canFallback: false,
      });

      db._mocks.mockFirst.mockResolvedValueOnce({
        id: 5,
        title: 'No provider',
        body: null,
        severity: 'info',
        kind: null,
        date: null,
        metadata: null,
      });

      await expect(triageInboxItem(env, 5)).rejects.toThrow('No AI provider available');
    });

    it('should normalize invalid classification to normal', async () => {
      const db = createMockDb();
      const mockAI = {} as any;
      const env = { DB: db, AI: mockAI };

      (selectModel as ReturnType<typeof vi.fn>).mockReturnValue({
        provider: AIProvider.WORKERS_AI,
        model: '@cf/meta/llama-3.1-8b-instruct',
        canFallback: false,
      });

      db._mocks.mockFirst.mockResolvedValueOnce({
        id: 6,
        title: 'Test',
        body: null,
        severity: 'info',
        kind: null,
        date: null,
        metadata: null,
      });

      (callLlamaForJSON as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          classification: 'invalid_value',
          suggestedAction: 'Some action',
          reasoning: 'Some reason',
        },
        rawText: '{}',
      });

      const result = await triageInboxItem(env, 6);

      expect(result.classification).toBe('normal');
    });

    it('should truncate suggestedAction to 50 chars and reasoning to 100 chars', async () => {
      const db = createMockDb();
      const mockAI = {} as any;
      const env = { DB: db, AI: mockAI };

      (selectModel as ReturnType<typeof vi.fn>).mockReturnValue({
        provider: AIProvider.WORKERS_AI,
        model: '@cf/meta/llama-3.1-8b-instruct',
        canFallback: false,
      });

      db._mocks.mockFirst.mockResolvedValueOnce({
        id: 7,
        title: 'Test',
        body: null,
        severity: 'info',
        kind: null,
        date: null,
        metadata: null,
      });

      (callLlamaForJSON as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          classification: 'normal',
          suggestedAction: 'A'.repeat(100),
          reasoning: 'B'.repeat(200),
        },
        rawText: '{}',
      });

      const result = await triageInboxItem(env, 7);

      expect(result.suggestedAction.length).toBe(50);
      expect(result.reasoning.length).toBe(100);
    });

    it('should update inbox item metadata with triage result', async () => {
      const db = createMockDb();
      const env = { DB: db, CLAUDE_API_KEY: 'sk-test' };

      (selectModel as ReturnType<typeof vi.fn>).mockReturnValue({
        provider: AIProvider.CLAUDE,
        model: 'claude-sonnet',
        canFallback: false,
      });

      db._mocks.mockFirst.mockResolvedValueOnce({
        id: 8,
        title: 'Test',
        body: null,
        severity: 'info',
        kind: null,
        date: null,
        metadata: '{"existing":"data"}',
      });

      (callClaudeAPI as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'msg_test',
        model: 'claude-sonnet',
        content: [{ type: 'text', text: '{"classification":"urgent","suggestedAction":"Act now","reasoning":"Critical"}' }],
        usage: { input_tokens: 50, output_tokens: 20, total_tokens: 70 },
      });

      await triageInboxItem(env, 8);

      // Verify the metadata update was called
      const prepareCalls = db._mocks.mockPrepare.mock.calls;
      const updateCall = prepareCalls.find((c: string[]) =>
        c[0].includes('UPDATE inbox_items SET metadata')
      );
      expect(updateCall).toBeDefined();

      // Verify bind was called with JSON containing both existing and ai_triage data
      const bindCalls = db._mocks.mockBind.mock.calls;
      const metadataBindCall = bindCalls.find((c: unknown[]) => {
        if (typeof c[0] === 'string') {
          try {
            const parsed = JSON.parse(c[0]);
            return parsed.existing === 'data' && parsed.ai_triage;
          } catch {
            return false;
          }
        }
        return false;
      });
      expect(metadataBindCall).toBeDefined();
    });

    it('should parse Claude JSON from markdown code blocks', async () => {
      const db = createMockDb();
      const env = { DB: db, CLAUDE_API_KEY: 'sk-test' };

      (selectModel as ReturnType<typeof vi.fn>).mockReturnValue({
        provider: AIProvider.CLAUDE,
        model: 'claude-sonnet',
        canFallback: false,
      });

      db._mocks.mockFirst.mockResolvedValueOnce({
        id: 9,
        title: 'Test',
        body: null,
        severity: 'info',
        kind: null,
        date: null,
        metadata: null,
      });

      (callClaudeAPI as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'msg_test',
        model: 'claude-sonnet',
        content: [{ type: 'text', text: '```json\n{"classification":"low","suggestedAction":"Skip","reasoning":"Minor"}\n```' }],
        usage: { input_tokens: 50, output_tokens: 20, total_tokens: 70 },
      });

      const result = await triageInboxItem(env, 9);

      expect(result.classification).toBe('low');
    });

    it('should throw when Claude returns unparseable JSON', async () => {
      const db = createMockDb();
      const env = { DB: db, CLAUDE_API_KEY: 'sk-test' };

      (selectModel as ReturnType<typeof vi.fn>).mockReturnValue({
        provider: AIProvider.CLAUDE,
        model: 'claude-sonnet',
        canFallback: false,
      });

      db._mocks.mockFirst.mockResolvedValueOnce({
        id: 10,
        title: 'Test',
        body: null,
        severity: 'info',
        kind: null,
        date: null,
        metadata: null,
      });

      (callClaudeAPI as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'msg_test',
        model: 'claude-sonnet',
        content: [{ type: 'text', text: 'This is not JSON at all' }],
        usage: { input_tokens: 50, output_tokens: 20, total_tokens: 70 },
      });

      await expect(triageInboxItem(env, 10)).rejects.toThrow('Failed to parse AI response');
    });
  });

  describe('draftCustomerResponse', () => {
    it('should throw when CLAUDE_API_KEY is not configured', async () => {
      const db = createMockDb();
      const env = { DB: db };

      await expect(
        draftCustomerResponse(env, 1, 'Where is my order?')
      ).rejects.toThrow('CLAUDE_API_KEY not configured');
    });

    it('should throw when rate limit exceeded', async () => {
      const db = createMockDb();
      const env = { DB: db, CLAUDE_API_KEY: 'sk-test' };

      (checkRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue({
        allowed: false,
        remaining: 0,
        limit: 100,
      });

      await expect(
        draftCustomerResponse(env, 1, 'Where is my order?')
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should throw when order not found', async () => {
      const db = createMockDb();
      const env = { DB: db, CLAUDE_API_KEY: 'sk-test' };

      db._mocks.mockFirst.mockResolvedValueOnce(null);

      await expect(
        draftCustomerResponse(env, 999, 'Where is my order?')
      ).rejects.toThrow('Order not found');
    });

    it('should draft response and create inbox item', async () => {
      const db = createMockDb();
      const env = { DB: db, CLAUDE_API_KEY: 'sk-test' };

      // Order query
      db._mocks.mockFirst.mockResolvedValueOnce({
        id: 42,
        status: 'paid',
        total_net: 5000,
        currency: 'JPY',
        name: 'Yamada Taro',
        email: 'yamada@example.com',
      });

      db._mocks.mockRun
        .mockResolvedValueOnce({ meta: { last_row_id: 77 } })  // inbox
        .mockResolvedValueOnce({ meta: {} }); // workflow log

      (callClaudeAPI as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'msg_test',
        model: 'claude-sonnet',
        content: [{ type: 'text', text: '{"subject":"ご注文について","body":"山田様、ご注文ありがとうございます。"}' }],
        usage: { input_tokens: 200, output_tokens: 100, total_tokens: 300 },
      });

      const result = await draftCustomerResponse(env, 42, '注文の状況を教えてください');

      expect(result.inboxItemId).toBe(77);
      expect(result.draftContent).toContain('ご注文について');
      expect(result.draftContent).toContain('山田様');

      // Verify prompt includes order details
      const callArgs = (callClaudeAPI as ReturnType<typeof vi.fn>).mock.calls[0];
      const payload = callArgs[1];
      expect(payload.messages[0].content).toContain('Yamada Taro');
      expect(payload.messages[0].content).toContain('5000');
      expect(payload.messages[0].content).toContain('注文の状況を教えてください');
    });

    it('should throw when Claude returns unparseable JSON', async () => {
      const db = createMockDb();
      const env = { DB: db, CLAUDE_API_KEY: 'sk-test' };

      db._mocks.mockFirst.mockResolvedValueOnce({
        id: 1,
        status: 'paid',
        total_net: 1000,
        currency: 'JPY',
        name: 'Test',
        email: 'test@example.com',
      });

      (callClaudeAPI as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'msg_test',
        model: 'claude-sonnet',
        content: [{ type: 'text', text: 'Not valid JSON response' }],
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      });

      await expect(
        draftCustomerResponse(env, 1, 'test message')
      ).rejects.toThrow('Failed to parse AI response');
    });
  });
});
