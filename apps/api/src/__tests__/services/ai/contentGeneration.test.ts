import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateContent, type ContentGenerationRequest } from '../../../services/ai/contentGeneration';

// Mock dependencies
vi.mock('../../../services/ai/claudeClient', () => ({
  callClaudeAPI: vi.fn(),
}));

vi.mock('../../../services/ai/rateLimiter', () => ({
  checkRateLimit: vi.fn(),
  trackAIUsage: vi.fn(),
}));

import { callClaudeAPI } from '../../../services/ai/claudeClient';
import { checkRateLimit, trackAIUsage } from '../../../services/ai/rateLimiter';

const createMockDb = () => {
  const mockRun = vi.fn().mockResolvedValue({ meta: { last_row_id: 1 } });
  const mockBind = vi.fn(() => ({ run: mockRun }));
  const mockPrepare = vi.fn(() => ({ bind: mockBind, run: mockRun }));

  return {
    prepare: mockPrepare,
    _mocks: { mockRun, mockBind, mockPrepare },
  } as unknown as D1Database & { _mocks: any };
};

const mockClaudeResponse = (text: string) => ({
  id: 'msg_test',
  model: 'claude-sonnet-4-5-20250929',
  content: [{ type: 'text', text }],
  usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
});

describe('contentGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (checkRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: true,
      remaining: 99,
      limit: 100,
    });
    (trackAIUsage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  describe('generateContent', () => {
    it('should throw when CLAUDE_API_KEY is not configured', async () => {
      const db = createMockDb();
      const env = { DB: db };

      const request: ContentGenerationRequest = {
        contentType: 'product_description',
        prompt: 'test',
        context: {},
      };

      await expect(generateContent(env, request)).rejects.toThrow('CLAUDE_API_KEY not configured');
    });

    it('should throw when rate limit is exceeded', async () => {
      const db = createMockDb();
      const env = { DB: db, CLAUDE_API_KEY: 'sk-test' };

      (checkRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue({
        allowed: false,
        remaining: 0,
        limit: 100,
      });

      const request: ContentGenerationRequest = {
        contentType: 'product_description',
        prompt: 'test',
        context: {},
      };

      await expect(generateContent(env, request)).rejects.toThrow('Rate limit exceeded');
    });

    it('should build product description prompt with correct parameters', async () => {
      const db = createMockDb();
      const env = { DB: db, CLAUDE_API_KEY: 'sk-test' };

      (callClaudeAPI as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockClaudeResponse('{"description":"test","keywords":[],"highlights":[]}')
      );

      const request: ContentGenerationRequest = {
        contentType: 'product_description',
        prompt: 'describe product',
        context: { productTitle: 'Amazing Widget', tone: 'casual', length: 'short' },
      };

      await generateContent(env, request);

      const callArgs = (callClaudeAPI as ReturnType<typeof vi.fn>).mock.calls[0];
      const payload = callArgs[1];
      expect(payload.messages[0].content).toContain('Amazing Widget');
      expect(payload.messages[0].content).toContain('カジュアル');
      expect(payload.messages[0].content).toContain('50-100文字');
      expect(payload.system).toContain('コピーライター');
    });

    it('should build email prompt for order_confirmation', async () => {
      const db = createMockDb();
      const env = { DB: db, CLAUDE_API_KEY: 'sk-test' };

      (callClaudeAPI as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockClaudeResponse('{"subject":"test","body":"test"}')
      );

      const request: ContentGenerationRequest = {
        contentType: 'email',
        prompt: 'write email',
        context: {
          emailType: 'order_confirmation',
          customerName: 'Tanaka',
          orderNumber: 'ORD-001',
        },
      };

      await generateContent(env, request);

      const callArgs = (callClaudeAPI as ReturnType<typeof vi.fn>).mock.calls[0];
      const payload = callArgs[1];
      expect(payload.messages[0].content).toContain('Tanaka');
      expect(payload.messages[0].content).toContain('ORD-001');
      expect(payload.messages[0].content).toContain('注文確認');
      expect(payload.system).toContain('カスタマーサポート');
    });

    it('should build email prompt for shipping_notification', async () => {
      const db = createMockDb();
      const env = { DB: db, CLAUDE_API_KEY: 'sk-test' };

      (callClaudeAPI as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockClaudeResponse('{"subject":"shipped","body":"sent"}')
      );

      const request: ContentGenerationRequest = {
        contentType: 'email',
        prompt: 'write email',
        context: {
          emailType: 'shipping_notification',
          customerName: 'Sato',
          orderNumber: 'ORD-002',
          trackingNumber: 'TRK-123',
        },
      };

      await generateContent(env, request);

      const callArgs = (callClaudeAPI as ReturnType<typeof vi.fn>).mock.calls[0];
      const payload = callArgs[1];
      expect(payload.messages[0].content).toContain('Sato');
      expect(payload.messages[0].content).toContain('TRK-123');
      expect(payload.messages[0].content).toContain('発送通知');
    });

    it('should build report summary prompt with JSON data', async () => {
      const db = createMockDb();
      const env = { DB: db, CLAUDE_API_KEY: 'sk-test' };

      (callClaudeAPI as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockClaudeResponse('{"summary":"good","insights":[],"recommendations":[]}')
      );

      const request: ContentGenerationRequest = {
        contentType: 'report_summary',
        prompt: 'summarize',
        context: { totalSales: 50000, orderCount: 10 },
      };

      await generateContent(env, request);

      const callArgs = (callClaudeAPI as ReturnType<typeof vi.fn>).mock.calls[0];
      const payload = callArgs[1];
      expect(payload.messages[0].content).toContain('50000');
      expect(payload.messages[0].content).toContain('日次レポート');
      expect(payload.system).toContain('データ分析');
    });

    it('should build marketing copy prompt', async () => {
      const db = createMockDb();
      const env = { DB: db, CLAUDE_API_KEY: 'sk-test' };

      (callClaudeAPI as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockClaudeResponse('{"headline":"Sale","subheadline":"Now","cta":"Buy","bodyText":"text"}')
      );

      const request: ContentGenerationRequest = {
        contentType: 'marketing_copy',
        prompt: 'create copy',
        context: { campaignType: 'summer_sale', discount: '20%' },
      };

      await generateContent(env, request);

      const callArgs = (callClaudeAPI as ReturnType<typeof vi.fn>).mock.calls[0];
      const payload = callArgs[1];
      expect(payload.messages[0].content).toContain('summer_sale');
      expect(payload.system).toContain('マーケティング');
    });

    it('should save draft and inbox item, return correct result', async () => {
      const db = createMockDb();
      const env = { DB: db, CLAUDE_API_KEY: 'sk-test' };

      db._mocks.mockRun
        .mockResolvedValueOnce({ meta: { last_row_id: 42 } })  // draft
        .mockResolvedValueOnce({ meta: { last_row_id: 99 } })  // inbox
        .mockResolvedValueOnce({ meta: {} }); // workflow log

      (callClaudeAPI as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockClaudeResponse('Generated content here')
      );

      const request: ContentGenerationRequest = {
        contentType: 'product_description',
        prompt: 'describe',
        refType: 'product',
        refId: 5,
        context: { productTitle: 'Widget' },
      };

      const result = await generateContent(env, request);

      expect(result.draftId).toBe(42);
      expect(result.inboxItemId).toBe(99);
      expect(result.preview).toBe('Generated content here');

      // Verify trackAIUsage was called
      expect(trackAIUsage).toHaveBeenCalledWith(db, 'claude', 'content_generation', 150);
    });

    it('should pass AI Gateway config to Claude API', async () => {
      const db = createMockDb();
      const env = {
        DB: db,
        CLAUDE_API_KEY: 'sk-test',
        AI_GATEWAY_ACCOUNT_ID: 'acc-123',
        AI_GATEWAY_ID: 'gw-456',
      };

      (callClaudeAPI as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockClaudeResponse('content')
      );

      const request: ContentGenerationRequest = {
        contentType: 'product_description',
        prompt: 'test',
        context: {},
      };

      await generateContent(env, request);

      const callArgs = (callClaudeAPI as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[2]).toEqual({
        AI_GATEWAY_ACCOUNT_ID: 'acc-123',
        AI_GATEWAY_ID: 'gw-456',
      });
    });

    it('should use custom temperature when provided', async () => {
      const db = createMockDb();
      const env = { DB: db, CLAUDE_API_KEY: 'sk-test' };

      (callClaudeAPI as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockClaudeResponse('content')
      );

      const request: ContentGenerationRequest = {
        contentType: 'product_description',
        prompt: 'test',
        context: {},
        temperature: 0.3,
      };

      await generateContent(env, request);

      const callArgs = (callClaudeAPI as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].temperature).toBe(0.3);
    });

    it('should default temperature to 0.7', async () => {
      const db = createMockDb();
      const env = { DB: db, CLAUDE_API_KEY: 'sk-test' };

      (callClaudeAPI as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockClaudeResponse('content')
      );

      const request: ContentGenerationRequest = {
        contentType: 'product_description',
        prompt: 'test',
        context: {},
      };

      await generateContent(env, request);

      const callArgs = (callClaudeAPI as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].temperature).toBe(0.7);
    });

    it('should use custom prompt for unknown email type', async () => {
      const db = createMockDb();
      const env = { DB: db, CLAUDE_API_KEY: 'sk-test' };

      (callClaudeAPI as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockClaudeResponse('custom email')
      );

      const request: ContentGenerationRequest = {
        contentType: 'email',
        prompt: 'write email',
        context: {
          emailType: 'custom',
          customPrompt: 'Write a custom email about returns',
        },
      };

      await generateContent(env, request);

      const callArgs = (callClaudeAPI as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].messages[0].content).toBe('Write a custom email about returns');
    });
  });
});
