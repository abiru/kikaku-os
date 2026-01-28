import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callClaudeAPI, callClaudeAPIForJSON, estimateCost } from '../../../services/ai/claudeClient';

// Mock fetch globally
global.fetch = vi.fn();

describe('Claude Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('callClaudeAPI', () => {
    it('should call Claude API successfully', async () => {
      const mockResponse = {
        id: 'msg_123',
        model: 'claude-sonnet-4-5-20250929',
        content: [{ type: 'text', text: 'Hello, world!' }],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await callClaudeAPI('test-api-key', {
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 100,
      });

      expect(result.content[0].text).toBe('Hello, world!');
      expect(result.usage.total_tokens).toBe(15);
    });

    it('should add total_tokens if not present', async () => {
      const mockResponse = {
        id: 'msg_123',
        model: 'claude-sonnet-4-5-20250929',
        content: [{ type: 'text', text: 'Test' }],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await callClaudeAPI('test-api-key', {
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 100,
      });

      expect(result.usage.total_tokens).toBe(15);
    });

    it('should throw error when API key is missing', async () => {
      await expect(
        callClaudeAPI('', {
          messages: [{ role: 'user', content: 'Test' }],
          max_tokens: 100,
        })
      ).rejects.toThrow('CLAUDE_API_KEY not configured');
    });

    it('should throw error on API failure', async () => {
      // Mock 3 failures with 400 error
      for (let i = 0; i < 3; i++) {
        (global.fetch as any).mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: async () => 'Invalid request',
        });
      }

      await expect(
        callClaudeAPI('test-api-key', {
          messages: [{ role: 'user', content: 'Test' }],
          max_tokens: 100,
        })
      ).rejects.toThrow('Claude API error: 400');
    });

    it('should retry on rate limit (429)', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          text: async () => 'Rate limited',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'msg_123',
            content: [{ type: 'text', text: 'Success after retry' }],
            usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
          }),
        });

      const result = await callClaudeAPI('test-api-key', {
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 100,
      });

      expect(result.content[0].text).toBe('Success after retry');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retries', async () => {
      // Mock 3 failures
      for (let i = 0; i < 3; i++) {
        (global.fetch as any).mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => 'Server error',
        });
      }

      await expect(
        callClaudeAPI('test-api-key', {
          messages: [{ role: 'user', content: 'Test' }],
          max_tokens: 100,
        })
      ).rejects.toThrow('Failed to call Claude API');
    });

    it('should validate response structure', async () => {
      // Mock 3 responses with empty content
      for (let i = 0; i < 3; i++) {
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'msg_123',
            content: [], // Empty content
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
        });
      }

      await expect(
        callClaudeAPI('test-api-key', {
          messages: [{ role: 'user', content: 'Test' }],
          max_tokens: 100,
        })
      ).rejects.toThrow('Invalid response structure');
    });
  });

  describe('callClaudeAPIForJSON', () => {
    it('should parse JSON response', async () => {
      const mockResponse = {
        id: 'msg_123',
        model: 'claude-sonnet-4-5-20250929',
        content: [{ type: 'text', text: '{"result": "success"}' }],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          total_tokens: 15,
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await callClaudeAPIForJSON<{ result: string }>('test-api-key', {
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 100,
      });

      expect(result.data.result).toBe('success');
      expect(result.usage.total_tokens).toBe(15);
    });

    it('should extract JSON from markdown code blocks', async () => {
      const mockResponse = {
        id: 'msg_123',
        model: 'claude-sonnet-4-5-20250929',
        content: [{ type: 'text', text: '```json\n{"result": "success"}\n```' }],
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await callClaudeAPIForJSON<{ result: string }>('test-api-key', {
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 100,
      });

      expect(result.data.result).toBe('success');
    });

    it('should throw error on invalid JSON', async () => {
      const mockResponse = {
        id: 'msg_123',
        model: 'claude-sonnet-4-5-20250929',
        content: [{ type: 'text', text: 'Not valid JSON' }],
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await expect(
        callClaudeAPIForJSON('test-api-key', {
          messages: [{ role: 'user', content: 'Test' }],
          max_tokens: 100,
        })
      ).rejects.toThrow('Failed to parse JSON');
    });
  });

  describe('estimateCost', () => {
    it('should estimate cost for token usage', () => {
      expect(estimateCost(1_000_000)).toBe(900); // $9 per 1M tokens
      expect(estimateCost(500_000)).toBe(450);
      expect(estimateCost(100_000)).toBe(90);
    });

    it('should round up to nearest cent', () => {
      expect(estimateCost(1000)).toBeGreaterThan(0);
    });
  });
});
