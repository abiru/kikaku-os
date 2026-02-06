import { describe, it, expect } from 'vitest';
import {
  selectModel,
  AITaskType,
  AIProvider,
  MODELS,
  isWorkersAIAvailable,
  isClaudeAvailable,
  getCostMultiplier,
  type AIBindings,
} from '../../../services/ai/modelRouter';

describe('Model Router', () => {
  describe('selectModel', () => {
    it('should select Workers AI for triage when available', () => {
      const env: AIBindings = {
        AI: { run: async () => ({}) } as any,
        CLAUDE_API_KEY: 'test-key',
      };

      const result = selectModel(AITaskType.TRIAGE, env);

      expect(result.provider).toBe(AIProvider.WORKERS_AI);
      expect(result.model).toBe(MODELS.WORKERS_AI.LLAMA_3_1_8B);
      expect(result.canFallback).toBe(true);
      expect(result.fallbackProvider).toBe(AIProvider.CLAUDE);
    });

    it('should fallback to Claude for triage when Workers AI not available', () => {
      const env: AIBindings = {
        AI: undefined,
        CLAUDE_API_KEY: 'test-key',
      };

      const result = selectModel(AITaskType.TRIAGE, env);

      expect(result.provider).toBe(AIProvider.CLAUDE);
      expect(result.model).toBe(MODELS.CLAUDE.SONNET);
      expect(result.canFallback).toBe(false);
    });

    it('should select Workers AI for classification', () => {
      const env: AIBindings = {
        AI: { run: async () => ({}) } as any,
        CLAUDE_API_KEY: 'test-key',
      };

      const result = selectModel(AITaskType.CLASSIFICATION, env);

      expect(result.provider).toBe(AIProvider.WORKERS_AI);
      expect(result.canFallback).toBe(true);
    });

    it('should select BGE model for embeddings', () => {
      const env: AIBindings = {
        AI: { run: async () => ({}) } as any,
      };

      const result = selectModel(AITaskType.EMBEDDINGS, env);

      expect(result.provider).toBe(AIProvider.WORKERS_AI);
      expect(result.model).toBe(MODELS.WORKERS_AI.BGE_BASE_EN);
      expect(result.canFallback).toBe(false);
    });

    it('should always select Claude for content generation', () => {
      const env: AIBindings = {
        AI: { run: async () => ({}) } as any,
        CLAUDE_API_KEY: 'test-key',
      };

      const result = selectModel(AITaskType.CONTENT_GENERATION, env);

      expect(result.provider).toBe(AIProvider.CLAUDE);
      expect(result.model).toBe(MODELS.CLAUDE.SONNET);
      expect(result.canFallback).toBe(false);
    });

    it('should always select Claude for customer responses', () => {
      const env: AIBindings = {
        AI: { run: async () => ({}) } as any,
        CLAUDE_API_KEY: 'test-key',
      };

      const result = selectModel(AITaskType.CUSTOMER_RESPONSE, env);

      expect(result.provider).toBe(AIProvider.CLAUDE);
    });

    it('should throw error when no AI provider available', () => {
      const env: AIBindings = {
        AI: undefined,
        CLAUDE_API_KEY: undefined,
      };

      expect(() => selectModel(AITaskType.TRIAGE, env)).toThrow(
        'No AI provider available'
      );
    });

    it('should throw error for embeddings when Workers AI not available', () => {
      const env: AIBindings = {
        AI: undefined,
        CLAUDE_API_KEY: 'test-key',
      };

      expect(() => selectModel(AITaskType.EMBEDDINGS, env)).toThrow(
        'No AI provider available'
      );
    });

    it('should include fallback model info when canFallback is true', () => {
      const env: AIBindings = {
        AI: { run: async () => ({}) } as any,
        CLAUDE_API_KEY: 'test-key',
      };

      const result = selectModel(AITaskType.TRIAGE, env);

      expect(result.canFallback).toBe(true);
      expect(result.fallbackProvider).toBe(AIProvider.CLAUDE);
      expect(result.fallbackModel).toBe(MODELS.CLAUDE.SONNET);
    });

    it('should not include fallback info when canFallback is false', () => {
      const env: AIBindings = {
        AI: undefined,
        CLAUDE_API_KEY: 'test-key',
      };

      const result = selectModel(AITaskType.TRIAGE, env);

      expect(result.canFallback).toBe(false);
      expect(result.fallbackProvider).toBeUndefined();
      expect(result.fallbackModel).toBeUndefined();
    });
  });

  describe('isWorkersAIAvailable', () => {
    it('should return true when AI binding is present', () => {
      const env: AIBindings = {
        AI: { run: async () => ({}) } as any,
      };

      expect(isWorkersAIAvailable(env)).toBe(true);
    });

    it('should return false when AI binding is undefined', () => {
      const env: AIBindings = {
        AI: undefined,
      };

      expect(isWorkersAIAvailable(env)).toBe(false);
    });
  });

  describe('isClaudeAvailable', () => {
    it('should return true when CLAUDE_API_KEY is present', () => {
      const env: AIBindings = {
        CLAUDE_API_KEY: 'test-key',
      };

      expect(isClaudeAvailable(env)).toBe(true);
    });

    it('should return false when CLAUDE_API_KEY is undefined', () => {
      const env: AIBindings = {
        CLAUDE_API_KEY: undefined,
      };

      expect(isClaudeAvailable(env)).toBe(false);
    });
  });

  describe('getCostMultiplier', () => {
    it('should return 0.1 for Workers AI', () => {
      expect(getCostMultiplier(AIProvider.WORKERS_AI)).toBe(0.1);
    });

    it('should return 1.0 for Claude', () => {
      expect(getCostMultiplier(AIProvider.CLAUDE)).toBe(1.0);
    });
  });

  describe('model constants', () => {
    it('should have correct Workers AI model names', () => {
      expect(MODELS.WORKERS_AI.LLAMA_3_1_8B).toBe(
        '@cf/meta/llama-3.1-8b-instruct'
      );
      expect(MODELS.WORKERS_AI.BGE_BASE_EN).toBe('@cf/baai/bge-base-en-v1.5');
    });

    it('should have correct Claude model name', () => {
      expect(MODELS.CLAUDE.SONNET).toBe('claude-sonnet-4-5-20250929');
    });
  });
});
