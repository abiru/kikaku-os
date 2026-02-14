import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  callLlama,
  callLlamaChat,
  callLlamaForJSON,
  generateEmbeddings,
  estimateTokens,
} from '../../../services/ai/workersAIClient';
import { extractJSON } from '../../../lib/json';
import type { Ai } from '../../../env';

describe('Workers AI Client', () => {
  let mockAi: Ai;

  beforeEach(() => {
    mockAi = {
      run: vi.fn(),
    } as unknown as Ai;
  });

  describe('callLlama', () => {
    it('should call Workers AI Llama successfully', async () => {
      (mockAi.run as any).mockResolvedValueOnce({
        response: 'Hello, world!',
      });

      const result = await callLlama(mockAi, 'Say hello');

      expect(result.text).toBe('Hello, world!');
      expect(result.provider).toBe('workers_ai');
      expect(result.model).toBe('@cf/meta/llama-3.1-8b-instruct');
    });

    it('should include system prompt in messages', async () => {
      (mockAi.run as any).mockResolvedValueOnce({
        response: 'Test response',
      });

      await callLlama(mockAi, 'Test prompt', {
        systemPrompt: 'You are a helpful assistant',
      });

      expect(mockAi.run).toHaveBeenCalledWith(
        '@cf/meta/llama-3.1-8b-instruct',
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'You are a helpful assistant' },
            { role: 'user', content: 'Test prompt' },
          ],
        })
      );
    });

    it('should pass maxTokens and temperature options', async () => {
      (mockAi.run as any).mockResolvedValueOnce({
        response: 'Test',
      });

      await callLlama(mockAi, 'Test', {
        maxTokens: 256,
        temperature: 0.5,
      });

      expect(mockAi.run).toHaveBeenCalledWith(
        '@cf/meta/llama-3.1-8b-instruct',
        expect.objectContaining({
          max_tokens: 256,
          temperature: 0.5,
        })
      );
    });

    it('should retry on failure', async () => {
      (mockAi.run as any)
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({
          response: 'Success after retry',
        });

      const result = await callLlama(mockAi, 'Test');

      expect(result.text).toBe('Success after retry');
      expect(mockAi.run).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      (mockAi.run as any)
        .mockRejectedValueOnce(new Error('Failure 1'))
        .mockRejectedValueOnce(new Error('Failure 2'));

      await expect(callLlama(mockAi, 'Test')).rejects.toThrow(
        'Workers AI Llama failed after 2 attempts'
      );
    });

    it('should throw on invalid response structure', async () => {
      (mockAi.run as any)
        .mockResolvedValueOnce({ invalid: 'structure' })
        .mockResolvedValueOnce({ invalid: 'structure' });

      await expect(callLlama(mockAi, 'Test')).rejects.toThrow(
        'Invalid Workers AI response structure'
      );
    });
  });

  describe('callLlamaChat', () => {
    it('should call with chat messages', async () => {
      (mockAi.run as any).mockResolvedValueOnce({
        response: 'Chat response',
      });

      const messages = [
        { role: 'system' as const, content: 'You are helpful' },
        { role: 'user' as const, content: 'Hello' },
      ];

      const result = await callLlamaChat(mockAi, messages);

      expect(result.text).toBe('Chat response');
      expect(mockAi.run).toHaveBeenCalledWith(
        '@cf/meta/llama-3.1-8b-instruct',
        expect.objectContaining({
          messages,
        })
      );
    });
  });

  describe('callLlamaForJSON', () => {
    it('should parse JSON response', async () => {
      (mockAi.run as any).mockResolvedValueOnce({
        response: '{"result": "success", "count": 42}',
      });

      const result = await callLlamaForJSON<{ result: string; count: number }>(
        mockAi,
        'Return JSON'
      );

      expect(result.data.result).toBe('success');
      expect(result.data.count).toBe(42);
    });

    it('should extract JSON from markdown code blocks', async () => {
      (mockAi.run as any).mockResolvedValueOnce({
        response: '```json\n{"result": "success"}\n```',
      });

      const result = await callLlamaForJSON<{ result: string }>(
        mockAi,
        'Return JSON'
      );

      expect(result.data.result).toBe('success');
    });

    it('should throw on invalid JSON', async () => {
      (mockAi.run as any).mockResolvedValueOnce({
        response: 'Not valid JSON at all',
      });

      await expect(
        callLlamaForJSON(mockAi, 'Return JSON')
      ).rejects.toThrow('Failed to parse JSON');
    });
  });

  describe('generateEmbeddings', () => {
    it('should generate embeddings for single text', async () => {
      (mockAi.run as any).mockResolvedValueOnce({
        shape: [1, 768],
        data: [[0.1, 0.2, 0.3]],
      });

      const result = await generateEmbeddings(mockAi, 'Test text');

      expect(result.embeddings).toHaveLength(1);
      expect(result.embeddings[0]).toEqual([0.1, 0.2, 0.3]);
      expect(result.model).toBe('@cf/baai/bge-base-en-v1.5');
    });

    it('should generate embeddings for multiple texts', async () => {
      (mockAi.run as any).mockResolvedValueOnce({
        shape: [2, 768],
        data: [
          [0.1, 0.2],
          [0.3, 0.4],
        ],
      });

      const result = await generateEmbeddings(mockAi, ['Text 1', 'Text 2']);

      expect(result.embeddings).toHaveLength(2);
    });

    it('should retry on failure', async () => {
      (mockAi.run as any)
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({
          shape: [1, 768],
          data: [[0.1]],
        });

      const result = await generateEmbeddings(mockAi, 'Test');

      expect(result.embeddings).toHaveLength(1);
      expect(mockAi.run).toHaveBeenCalledTimes(2);
    });

    it('should throw on invalid response', async () => {
      (mockAi.run as any)
        .mockResolvedValueOnce({ invalid: 'structure' })
        .mockResolvedValueOnce({ invalid: 'structure' });

      await expect(generateEmbeddings(mockAi, 'Test')).rejects.toThrow(
        'Invalid Workers AI embeddings response structure'
      );
    });
  });

  describe('extractJSON', () => {
    it('should extract JSON from code block with json tag', () => {
      const text = '```json\n{"key": "value"}\n```';
      expect(extractJSON(text)).toBe('{"key": "value"}');
    });

    it('should extract JSON from code block without tag', () => {
      const text = '```\n{"key": "value"}\n```';
      expect(extractJSON(text)).toBe('{"key": "value"}');
    });

    it('should extract JSON object from plain text', () => {
      const text = 'Here is the result: {"key": "value"} end';
      expect(extractJSON(text)).toBe('{"key": "value"}');
    });

    it('should return trimmed text if no JSON found', () => {
      const text = '  plain text  ';
      expect(extractJSON(text)).toBe('plain text');
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens for English text', () => {
      const text = 'Hello, how are you?';
      const tokens = estimateTokens(text);
      // ~19 chars / 4 = ~5 tokens
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(20);
    });

    it('should estimate more tokens for Japanese text', () => {
      const text = 'こんにちは、お元気ですか？';
      const tokens = estimateTokens(text);
      // Japanese uses more tokens per character
      expect(tokens).toBeGreaterThan(0);
    });

    it('should handle empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('should use different ratio for Japanese text', () => {
      const english = 'Hello world';
      const japanese = 'こんにちは世界';

      const englishTokens = estimateTokens(english);
      const japaneseTokens = estimateTokens(japanese);

      // Japanese should have higher token density
      const englishRatio = english.length / englishTokens;
      const japaneseRatio = japanese.length / japaneseTokens;

      expect(englishRatio).toBeGreaterThan(japaneseRatio);
    });
  });
});
